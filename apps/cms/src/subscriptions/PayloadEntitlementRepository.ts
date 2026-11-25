import type { Payload } from 'payload'

import type {
  EntitlementFeature,
  EntitlementID,
  EntitlementRepository,
  EntitlementSubscription,
  EntitlementUser,
  EntitlementWidgetSubscription,
} from './types'

function relationshipID(value: unknown): EntitlementID | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}

export class PayloadEntitlementRepository implements EntitlementRepository {
  constructor(private readonly payload: Payload) {}

  async getUser(userId: EntitlementID): Promise<EntitlementUser | null> {
    try {
      const user = await this.payload.findByID({
        collection: 'users',
        id: userId as number,
        depth: 0,
        overrideAccess: true,
      })
      return {
        id: user.id,
        role: user.role,
        accountStatus: user.accountStatus,
      }
    } catch {
      return null
    }
  }

  async getFeatureByCode(featureCode: string): Promise<EntitlementFeature | null> {
    const result = await this.payload.find({
      collection: 'features',
      where: { code: { equals: featureCode } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const feature = result.docs[0]
    if (!feature) return null

    return {
      id: feature.id,
      code: feature.code,
      status: feature.status,
      category: feature.category,
    }
  }

  async getSubscriptions(userId: EntitlementID): Promise<EntitlementSubscription[]> {
    const result = await this.payload.find({
      collection: 'user-subscriptions',
      where: { user: { equals: userId as number } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    const subscriptions = await Promise.all(
      result.docs.map(async (subscription) => {
        const planId = relationshipID(subscription.plan)
        if (planId === null) return null

        let planStatus = 'inactive'
        try {
          const plan = await this.payload.findByID({
            collection: 'subscription-plans',
            id: planId as number,
            depth: 0,
            overrideAccess: true,
          })
          planStatus = plan.status
        } catch {
          // Missing plans are treated as inactive.
        }

        return {
          id: subscription.id,
          planId,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          planStatus,
        }
      }),
    )

    return subscriptions.filter((item) => item !== null) as EntitlementSubscription[]
  }

  async getWidgetSubscriptions(userId: EntitlementID): Promise<EntitlementWidgetSubscription[]> {
    const result = await this.payload.find({
      collection: 'user-widget-subscriptions',
      where: { user: { equals: userId as number } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    return result.docs.flatMap((subscription) => {
      const featureId = relationshipID(subscription.feature)
      if (featureId === null) return []
      return [{
        id: subscription.id,
        featureId,
        status: subscription.status,
        startDate: subscription.startDate,
        currentPeriodEnd: subscription.currentPeriodEnd,
      }]
    })
  }

  async hasMainPlanFeature(userId: EntitlementID, featureId: EntitlementID, now: Date): Promise<boolean> {
    if (!Number.isFinite(now.getTime())) return false
    const result = await this.payload.find({
      collection: 'user-subscriptions',
      where: { and: [{ user: { equals: userId as number } }, { status: { equals: 'active' } }] },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const subscription of result.docs) {
      const start = Date.parse(subscription.startDate)
      const end = subscription.endDate ? Date.parse(subscription.endDate) : Number.POSITIVE_INFINITY
      if (subscription.status !== 'active' || start > now.getTime() || !Number.isFinite(start) || end <= now.getTime()) continue
      const planId = relationshipID(subscription.plan)
      if (planId === null) continue
      try {
        const plan = await this.payload.findByID({
          collection: 'subscription-plans', id: planId as number, depth: 0, overrideAccess: true,
        })
        if (plan.status === 'active' && await this.hasActivePlanFeature(planId, featureId)) return true
      } catch {
        // Broken or missing plan references never count as included features.
      }
    }
    return false
  }

  async hasActivePlanFeature(planId: EntitlementID, featureId: EntitlementID): Promise<boolean> {
    const result = await this.payload.find({
      collection: 'feature-entitlements',
      where: {
        and: [
          { plan: { equals: planId as number } },
          { feature: { equals: featureId as number } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return result.docs.length > 0
  }
}
