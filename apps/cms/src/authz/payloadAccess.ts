import { USER_ROLES } from './AuthorizationAdapter'
import type { AuthorizationRequest, AuthorizationSubject } from './AuthorizationAdapter'
import { getCasbinAdapter } from './CasbinAdapter'
import type { Access } from 'payload'

type PayloadUserLike = {
  id?: string | number
  role?: unknown
  accountStatus?: unknown
}

export function toAuthorizationSubject(user: unknown): AuthorizationSubject | null {
  if (!user || typeof user !== 'object') return null

  const candidate = user as PayloadUserLike
  if (
    (typeof candidate.id !== 'string' && typeof candidate.id !== 'number') ||
    typeof candidate.role !== 'string' ||
    typeof candidate.accountStatus !== 'string'
  ) {
    return null
  }

  return {
    id: candidate.id,
    role: candidate.role,
    accountStatus: candidate.accountStatus,
  }
}

export async function authorizePayloadUser(
  user: unknown,
  request: Omit<AuthorizationRequest, 'subject'>,
): Promise<boolean> {
  const subject = toAuthorizationSubject(user)
  if (!subject) return false

  try {
    return await (await getCasbinAdapter()).isAllowed({ ...request, subject })
  } catch {
    return false
  }
}

export function sameUserID(left: string | number | undefined, right: string | number | undefined): boolean {
  return left !== undefined && right !== undefined && String(left) === String(right)
}


export async function canAssignUserRole(
  user: unknown,
  targetRole: unknown,
  targetUserId?: string | number,
): Promise<boolean> {
  const subject = toAuthorizationSubject(user)
  if (
    !subject ||
    typeof targetRole !== 'string' ||
    !USER_ROLES.includes(targetRole as (typeof USER_ROLES)[number]) ||
    sameUserID(subject.id, targetUserId)
  ) {
    return false
  }

  const action = targetRole === 'admin' || targetRole === 'super_admin'
    ? 'assign_privileged_role'
    : 'assign_role'

  return authorizePayloadUser(user, {
    action,
    resource: {
      type: 'users',
      id: targetUserId,
      attributes: { ownerId: targetUserId ?? null, tenantId: null },
    },
    context: { targetIsSelf: false, tenantId: null },
  })
}


export function createAdminOnlyAccess(resourceType: string): {
  create: Access
  read: Access
  update: Access
  delete: Access
} {
  const check = (action: string): Access => async ({ req, id }) =>
    authorizePayloadUser(req.user, {
      action,
      resource: {
        type: resourceType,
        id,
        attributes: { ownerId: null, tenantId: null },
      },
    })

  return {
    create: check('create'),
    read: check('read'),
    update: check('update'),
    delete: check('delete'),
  }
}
