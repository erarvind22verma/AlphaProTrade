export const USER_ROLES = [
  'super_admin',
  'admin',
  'content_author',
  'content_editor',
  'content_approver',
  'subscriber',
  'trader',
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ACCOUNT_STATUSES = ['active', 'suspended', 'pending'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export type AuthorizationSubject = {
  id: string | number
  role: string
  accountStatus: string
}

export type AuthorizationResource = {
  type: string
  id?: string | number
  attributes: Record<string, unknown> & { ownerId?: string | number | null; tenantId?: string | null }
}

export type AuthorizationContext = {
  targetIsSelf?: boolean
  tenantId?: string | null
  [key: string]: unknown
}

export type AuthorizationRequest = {
  subject: AuthorizationSubject
  action: string
  resource: AuthorizationResource
  context?: AuthorizationContext
}

/**
 * Application-owned authorization contract. Payload and other callers depend on
 * this interface so the Casbin implementation can be replaced independently.
 */
export interface AuthorizationAdapter {
  isAllowed(request: AuthorizationRequest): Promise<boolean>
}
