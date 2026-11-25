import type { AuthorizationAdapter } from '../authz/AuthorizationAdapter'

export type EntitlementID = number | string
export type EntitlementRole =
  | 'super_admin'
  | 'admin'
  | 'content_author'
  | 'content_editor'
  | 'content_approver'
  | 'subscriber'
  | 'trader'

export interface EntitlementUser {
  id: EntitlementID
  role: string
  accountStatus: string
}

export interface EntitlementFeature {
  id: EntitlementID
  code: string
  status: string
  category?: string
}

export interface EntitlementSubscription {
  id: EntitlementID
  planId: EntitlementID
  status: string
  startDate: string | Date
  endDate?: string | Date | null
  planStatus: string
}

export interface EntitlementWidgetSubscription {
  id: EntitlementID
  featureId: EntitlementID
  status: 'active' | 'cancelled' | 'expired' | string
  startDate: string | Date
  currentPeriodEnd: string | Date
}

export interface EntitlementRepository {
  getUser(userId: EntitlementID): Promise<EntitlementUser | null>
  getFeatureByCode(featureCode: string): Promise<EntitlementFeature | null>
  getSubscriptions(userId: EntitlementID): Promise<EntitlementSubscription[]>
  getWidgetSubscriptions(userId: EntitlementID): Promise<EntitlementWidgetSubscription[]>
  hasActivePlanFeature(planId: EntitlementID, featureId: EntitlementID): Promise<boolean>
  hasMainPlanFeature(userId: EntitlementID, featureId: EntitlementID, now: Date): Promise<boolean>
}

export interface EntitlementServiceDependencies {
  repository: EntitlementRepository
  authorization: AuthorizationAdapter
}
