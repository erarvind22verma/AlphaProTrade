import type { AuthorizationRequest } from '../authz/AuthorizationAdapter'
import type {
  EntitlementID,
  EntitlementRepository,
  EntitlementServiceDependencies,
} from './types'
import { isWidgetSubscriptionEntitling } from './widgetBilling'

const subscriptionRoles = new Set(['subscriber', 'trader'])
const staffRoles = new Set(['admin', 'super_admin'])

function toTimestamp(value: string | Date): number | null {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export class EntitlementService {
  constructor(
    private readonly repository: EntitlementRepository,
    private readonly authorization: EntitlementServiceDependencies['authorization'],
  ) {}

  async canAccessFeature(
    userId: EntitlementID | null | undefined,
    featureCode: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (userId === null || userId === undefined || !featureCode.trim()) return false

    try {
      const user = await this.repository.getUser(userId)
      if (!user || user.accountStatus !== 'active') return false

      const feature = await this.repository.getFeatureByCode(featureCode)
      if (!feature || feature.status !== 'active') return false

      const authorizationRequest: AuthorizationRequest = {
        subject: {
          id: user.id,
          role: user.role,
          accountStatus: user.accountStatus,
        },
        action: 'use_feature',
        resource: {
          type: 'features',
          id: feature.id,
          attributes: {
            ownerId: null,
            tenantId: null,
            code: feature.code,
            category: feature.category ?? null,
          },
        },
        context: { tenantId: null },
      }

      if (!(await this.authorization.isAllowed(authorizationRequest))) return false

      // Active staff can inspect active features for support and QA. The role
      // still has to be authorized by the existing Casbin adapter above.
      if (staffRoles.has(user.role)) return true
      if (!subscriptionRoles.has(user.role)) return false

      const nowTimestamp = now.getTime()
      if (!Number.isFinite(nowTimestamp)) return false

      const subscriptions = await this.repository.getSubscriptions(user.id)
      for (const subscription of subscriptions) {
        if (subscription.status !== 'active' || subscription.planStatus !== 'active') continue

        const start = toTimestamp(subscription.startDate)
        if (start === null || start > nowTimestamp) continue

        if (subscription.endDate !== null && subscription.endDate !== undefined) {
          const end = toTimestamp(subscription.endDate)
          if (end === null || nowTimestamp >= end) continue
        }

        if (await this.repository.hasActivePlanFeature(subscription.planId, feature.id)) return true
      }

      const widgetSubscriptions = await this.repository.getWidgetSubscriptions(user.id)
      if (widgetSubscriptions.some((subscription) =>
        String(subscription.featureId) === String(feature.id) &&
        isWidgetSubscriptionEntitling(subscription, now),
      )) return true

      return false
    } catch {
      // Missing data and repository/policy errors always deny feature access.
      return false
    }
  }
}
