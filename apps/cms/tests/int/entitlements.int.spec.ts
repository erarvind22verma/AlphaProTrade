import { beforeAll, describe, expect, it } from 'vitest'

import { CasbinAdapter } from '@/authz/CasbinAdapter'
import { FeatureEntitlements } from '@/collections/FeatureEntitlements'
import { SubscriptionPlans } from '@/collections/SubscriptionPlans'
import { UserWidgetSubscriptions } from '@/collections/UserWidgetSubscriptions'
import { EntitlementService } from '@/subscriptions/EntitlementService'
import { FEATURE_SEEDS, PLAN_SEEDS } from '@/subscriptions/seedData'
import {
  calculateCurrentPeriodEnd,
  effectiveWidgetSubscriptionStatus,
  parseWidgetPurchaseRequest,
  subscriptionOwnedBy,
  widgetPurchaseConflict,
} from '@/subscriptions/widgetBilling'
import type {
  EntitlementFeature,
  EntitlementID,
  EntitlementRepository,
  EntitlementSubscription,
  EntitlementUser,
  EntitlementWidgetSubscription,
} from '@/subscriptions/types'

const NOW = new Date('2026-11-25T12:00:00.000Z')
const BASIC_PLAN_ID = 101
const PREMIUM_PLAN_ID = 102
const ENTERPRISE_PLAN_ID = 103
const FEATURE_IDS = new Map<string, number>(FEATURE_SEEDS.map((feature, index) => [feature.code, index + 1]))

class MemoryEntitlementRepository implements EntitlementRepository {
  users = new Map<string, EntitlementUser>()
  features = new Map<string, EntitlementFeature>()
  subscriptions = new Map<string, EntitlementSubscription[]>()
  widgetSubscriptions = new Map<string, EntitlementWidgetSubscription[]>()
  entitlements = new Set<string>()

  async getUser(userId: EntitlementID): Promise<EntitlementUser | null> {
    return this.users.get(String(userId)) ?? null
  }

  async getFeatureByCode(featureCode: string): Promise<EntitlementFeature | null> {
    return this.features.get(featureCode) ?? null
  }

  async getSubscriptions(userId: EntitlementID): Promise<EntitlementSubscription[]> {
    return this.subscriptions.get(String(userId)) ?? []
  }

  async getWidgetSubscriptions(userId: EntitlementID): Promise<EntitlementWidgetSubscription[]> {
    return this.widgetSubscriptions.get(String(userId)) ?? []
  }

  async hasActivePlanFeature(planId: EntitlementID, featureId: EntitlementID): Promise<boolean> {
    return this.entitlements.has(String(planId) + ':' + String(featureId))
  }

  async hasMainPlanFeature(userId: EntitlementID, featureId: EntitlementID, now: Date): Promise<boolean> {
    for (const subscription of this.subscriptions.get(String(userId)) ?? []) {
      const start = Date.parse(String(subscription.startDate))
      const end = subscription.endDate ? Date.parse(String(subscription.endDate)) : Number.POSITIVE_INFINITY
      if (subscription.status === 'active' && subscription.planStatus === 'active' &&
        Number.isFinite(start) && start <= now.getTime() && end > now.getTime() &&
        await this.hasActivePlanFeature(subscription.planId, featureId)) return true
    }
    return false
  }
}

describe('subscription entitlements', () => {
  let repository: MemoryEntitlementRepository
  let service: EntitlementService

  beforeAll(async () => {
    const adapter = await CasbinAdapter.create()
    repository = new MemoryEntitlementRepository()
    service = new EntitlementService(repository, adapter)

    const features: EntitlementFeature[] = FEATURE_SEEDS.map((feature, index) => ({
      id: index + 1,
      code: feature.code,
      category: feature.category,
      status: 'active',
    }))
    for (const feature of features) repository.features.set(feature.code, feature)

    const basicCodes = ['market-overview']
    const premiumCodes = ['market-overview', 'watchlist']
    const enterpriseCodes = FEATURE_SEEDS.map(({ code }) => code)
    for (const code of basicCodes) repository.entitlements.add(BASIC_PLAN_ID + ':' + FEATURE_IDS.get(code))
    for (const code of premiumCodes) repository.entitlements.add(PREMIUM_PLAN_ID + ':' + FEATURE_IDS.get(code))
    for (const code of enterpriseCodes) repository.entitlements.add(ENTERPRISE_PLAN_ID + ':' + FEATURE_IDS.get(code))
  })

  it('defines the exact five-widget plan comparison', () => {
    expect(PLAN_SEEDS.map(({ code, featureCodes }) => [code, featureCodes])).toEqual([
      ['basic', ['market-overview']],
      ['premium', ['market-overview', 'watchlist']],
      ['enterprise', ['market-overview', 'watchlist', 'basic-charts', 'market-news', 'portfolio-analytics']],
    ])
  })

  function setSubscriber(
    userId: string,
    planId: number,
    options: { status?: string; startDate?: string; endDate?: string; accountStatus?: string; role?: string } = {},
  ): void {
    repository.users.set(userId, {
      id: userId,
      role: options.role ?? 'subscriber',
      accountStatus: options.accountStatus ?? 'active',
    })
    repository.subscriptions.set(userId, [
      {
        id: userId + '-subscription',
        planId,
        status: options.status ?? 'active',
        startDate: options.startDate ?? '2026-01-01T00:00:00.000Z',
        endDate: options.endDate ?? '2027-01-01T00:00:00.000Z',
        planStatus: 'active',
      },
    ])
  }

  it('allows a Basic subscriber Market Overview only', async () => {
    setSubscriber('basic-user', BASIC_PLAN_ID)
    expect(await service.canAccessFeature('basic-user', 'market-overview', NOW)).toBe(true)
    for (const code of ['watchlist', 'basic-charts', 'market-news', 'portfolio-analytics']) {
      expect(await service.canAccessFeature('basic-user', code, NOW)).toBe(false)
    }
  })

  it('recognizes features already included in the active main plan', async () => {
    setSubscriber('included-user', BASIC_PLAN_ID)
    expect(await repository.hasMainPlanFeature('included-user', FEATURE_IDS.get('market-overview')!, NOW)).toBe(true)
    expect(await repository.hasMainPlanFeature('included-user', FEATURE_IDS.get('watchlist')!, NOW)).toBe(false)
  })

  it('grants access to a currently paid individual widget subscription', async () => {
    setSubscriber('individual-user', BASIC_PLAN_ID)
    repository.widgetSubscriptions.set('individual-user', [{
      id: 'widget-sub-1',
      featureId: FEATURE_IDS.get('watchlist')!,
      status: 'active',
      startDate: '2026-11-01T00:00:00.000Z',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    }])
    expect(await service.canAccessFeature('individual-user', 'watchlist', NOW)).toBe(true)
    expect(await service.canAccessFeature('individual-user', 'basic-charts', NOW)).toBe(false)
  })

  it('denies access when neither the main plan nor an individual subscription includes a widget', async () => {
    setSubscriber('no-widget-user', BASIC_PLAN_ID)
    expect(await service.canAccessFeature('no-widget-user', 'watchlist', NOW)).toBe(false)
  })

  it('prevents duplicate and main-plan-included widget purchases', () => {
    const current = [{ status: 'active', startDate: '2026-11-01T00:00:00.000Z', currentPeriodEnd: '2026-12-01T00:00:00.000Z' }]
    expect(widgetPurchaseConflict({ includedInMainPlan: false, subscriptions: current, now: NOW })).toBe('already-subscribed')
    expect(widgetPurchaseConflict({ includedInMainPlan: true, subscriptions: [], now: NOW })).toBe('included-in-main-plan')
    expect(widgetPurchaseConflict({ includedInMainPlan: false, subscriptions: [], now: NOW })).toBeNull()
  })

  it('calculates monthly and yearly renewal dates with month-end clamping', () => {
    const january31 = new Date('2026-01-31T10:15:00.000Z')
    expect(calculateCurrentPeriodEnd(january31, 'monthly').toISOString()).toBe('2026-02-28T10:15:00.000Z')
    expect(calculateCurrentPeriodEnd(january31, 'yearly').toISOString()).toBe('2027-01-31T10:15:00.000Z')
  })

  it('keeps cancelled widget access through the paid period and denies it after expiry', async () => {
    setSubscriber('cancelled-widget-user', BASIC_PLAN_ID)
    const subscription: EntitlementWidgetSubscription = {
      id: 'widget-sub-cancelled', featureId: FEATURE_IDS.get('watchlist')!, status: 'cancelled',
      startDate: '2026-11-01T00:00:00.000Z', currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    }
    repository.widgetSubscriptions.set('cancelled-widget-user', [subscription])
    expect(await service.canAccessFeature('cancelled-widget-user', 'watchlist', NOW)).toBe(true)
    repository.widgetSubscriptions.set('cancelled-widget-user', [{ ...subscription, currentPeriodEnd: '2026-11-24T00:00:00.000Z' }])
    expect(await service.canAccessFeature('cancelled-widget-user', 'watchlist', NOW)).toBe(false)
    expect(effectiveWidgetSubscriptionStatus('cancelled', '2026-11-24T00:00:00.000Z', NOW)).toBe('expired')
  })

  it('does not grant access to an expired individual widget subscription', async () => {
    setSubscriber('expired-widget-user', BASIC_PLAN_ID)
    repository.widgetSubscriptions.set('expired-widget-user', [{
      id: 'widget-sub-expired', featureId: FEATURE_IDS.get('watchlist')!, status: 'expired',
      startDate: '2026-01-01T00:00:00.000Z', currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    }])
    expect(await service.canAccessFeature('expired-widget-user', 'watchlist', NOW)).toBe(false)
  })

  it('keeps widget ownership server-bound and ignores client-supplied prices', async () => {
    expect(subscriptionOwnedBy(5, '5')).toBe(true)
    expect(subscriptionOwnedBy(5, 6)).toBe(false)
    expect(parseWidgetPurchaseRequest({
      featureCode: 'watchlist', billingCycle: 'yearly', user: 9, price: 0.01, status: 'active',
    })).toEqual({ featureCode: 'watchlist', billingCycle: 'yearly' })
    expect(parseWidgetPurchaseRequest({ featureCode: 'watchlist', billingCycle: 'weekly' })).toBeNull()

    const args = { req: { user: { id: 7, role: 'subscriber', accountStatus: 'active' } } } as never
    const create = UserWidgetSubscriptions.access?.create
    const update = UserWidgetSubscriptions.access?.update
    expect(create).toBeTypeOf('function')
    expect(update).toBeTypeOf('function')
    expect(await create?.(args)).toBe(false)
    expect(await update?.(args)).toBe(false)
  })

  it('allows Premium exactly Market Overview and Stock Watchlist', async () => {
    setSubscriber('premium-user', PREMIUM_PLAN_ID)
    for (const code of ['market-overview', 'watchlist']) {
      expect(await service.canAccessFeature('premium-user', code, NOW)).toBe(true)
    }
    for (const code of ['basic-charts', 'market-news', 'portfolio-analytics']) {
      expect(await service.canAccessFeature('premium-user', code, NOW)).toBe(false)
    }
  })

  it('denies Basic access to Stock Watchlist', async () => {
    setSubscriber('basic-user-premium-denied', BASIC_PLAN_ID)
    expect(await service.canAccessFeature('basic-user-premium-denied', 'watchlist', NOW)).toBe(false)
  })

  it('allows Enterprise access to all five features', async () => {
    setSubscriber('enterprise-user', ENTERPRISE_PLAN_ID)
    for (const feature of FEATURE_SEEDS) {
      expect(await service.canAccessFeature('enterprise-user', feature.code, NOW)).toBe(true)
    }
  })

  it('keeps super-admin staff access separate from subscriber plan entitlements', async () => {
    setSubscriber('basic-subscriber', BASIC_PLAN_ID, { role: 'subscriber' })
    setSubscriber('admin-only-user', BASIC_PLAN_ID, { role: 'super_admin' })
    expect(await service.canAccessFeature('admin-only-user', 'watchlist', NOW)).toBe(true)
    expect(await service.canAccessFeature('basic-subscriber', 'watchlist', NOW)).toBe(false)
    expect(await service.canAccessFeature('basic-subscriber', 'market-overview', NOW)).toBe(true)
  })

  it('denies expired subscriptions', async () => {
    setSubscriber('expired-user', PREMIUM_PLAN_ID, { endDate: '2026-11-24T00:00:00.000Z' })
    expect(await service.canAccessFeature('expired-user', 'watchlist', NOW)).toBe(false)
  })

  it('denies suspended accounts even when their role and subscription would otherwise allow access', async () => {
    setSubscriber('suspended-user', PREMIUM_PLAN_ID, { accountStatus: 'suspended' })
    expect(await service.canAccessFeature('suspended-user', 'watchlist', NOW)).toBe(false)
  })

  it('denies inactive features', async () => {
    setSubscriber('inactive-feature-user', PREMIUM_PLAN_ID)
    const feature = repository.features.get('basic-charts')
    if (feature) repository.features.set('basic-charts', { ...feature, status: 'inactive' })
    expect(await service.canAccessFeature('inactive-feature-user', 'basic-charts', NOW)).toBe(false)
    if (feature) repository.features.set('basic-charts', feature)
  })

  it('denies unknown features and anonymous users', async () => {
    setSubscriber('known-user', PREMIUM_PLAN_ID)
    expect(await service.canAccessFeature('known-user', 'made-up-feature', NOW)).toBe(false)
    expect(await service.canAccessFeature(null, 'market-overview', NOW)).toBe(false)
  })

  it('prevents non-admins from modifying subscription plans or feature entitlements', async () => {
    const args = (user: unknown) => ({ req: { user } }) as never
    const updatePlan = SubscriptionPlans.access?.update
    const createEntitlement = FeatureEntitlements.access?.create
    expect(updatePlan).toBeTypeOf('function')
    expect(createEntitlement).toBeTypeOf('function')
    expect(await updatePlan?.(args({ id: 'author', role: 'content_author', accountStatus: 'active' }))).toBe(false)
    expect(await createEntitlement?.(args({ id: 'subscriber', role: 'subscriber', accountStatus: 'active' }))).toBe(false)
    expect(await updatePlan?.(args({ id: 'admin', role: 'admin', accountStatus: 'active' }))).toBe(true)
  })
})
