import type { EntitlementWidgetSubscription } from './types'

export type WidgetBillingCycle = 'monthly' | 'yearly'
export type WidgetSubscriptionStatus = 'active' | 'cancelled' | 'expired'

export interface WidgetPurchaseRequest {
  featureCode: string
  billingCycle: WidgetBillingCycle
}

export function parseWidgetPurchaseRequest(value: unknown): WidgetPurchaseRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.featureCode !== 'string' || !input.featureCode.trim()) return null
  if (input.billingCycle !== 'monthly' && input.billingCycle !== 'yearly') return null
  // Price, user, status, and dates are intentionally omitted; the API owns those values.
  return { featureCode: input.featureCode.trim(), billingCycle: input.billingCycle }
}

export function calculateCurrentPeriodEnd(start: Date, cycle: WidgetBillingCycle): Date {
  const year = start.getUTCFullYear() + (cycle === 'yearly' ? 1 : 0)
  const rawMonth = start.getUTCMonth() + (cycle === 'monthly' ? 1 : 0)
  const targetYear = year + Math.floor(rawMonth / 12)
  const targetMonth = rawMonth % 12
  const day = start.getUTCDate()
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const end = new Date(start)
  end.setUTCDate(1)
  end.setUTCFullYear(targetYear, targetMonth, Math.min(day, lastDay))
  return end
}

export function isWidgetSubscriptionEntitling(
  subscription: Pick<EntitlementWidgetSubscription, 'status' | 'startDate' | 'currentPeriodEnd'>,
  now: Date,
): boolean {
  if (subscription.status !== 'active' && subscription.status !== 'cancelled') return false
  const start = Date.parse(String(subscription.startDate))
  const end = Date.parse(String(subscription.currentPeriodEnd))
  return Number.isFinite(now.getTime()) && Number.isFinite(start) && Number.isFinite(end) &&
    start <= now.getTime() && now.getTime() < end
}

export function effectiveWidgetSubscriptionStatus(
  status: WidgetSubscriptionStatus,
  currentPeriodEnd: string | Date,
  now: Date,
): WidgetSubscriptionStatus {
  const end = Date.parse(String(currentPeriodEnd))
  if (status !== 'expired' && (!Number.isFinite(end) || now.getTime() >= end)) return 'expired'
  return status
}

export function widgetPurchaseConflict(args: {
  includedInMainPlan: boolean
  subscriptions: Array<Pick<EntitlementWidgetSubscription, 'status' | 'startDate' | 'currentPeriodEnd'>>
  now: Date
}): 'included-in-main-plan' | 'already-subscribed' | null {
  if (args.includedInMainPlan) return 'included-in-main-plan'
  if (args.subscriptions.some((subscription) => isWidgetSubscriptionEntitling(subscription, args.now))) {
    return 'already-subscribed'
  }
  return null
}

export function subscriptionOwnedBy(subscriptionUserId: unknown, actorUserId: unknown): boolean {
  return (typeof subscriptionUserId === 'number' || typeof subscriptionUserId === 'string') &&
    (typeof actorUserId === 'number' || typeof actorUserId === 'string') &&
    String(subscriptionUserId) === String(actorUserId)
}
