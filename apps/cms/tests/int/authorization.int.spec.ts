import { beforeAll, describe, expect, it } from 'vitest'

import { CasbinAdapter } from '@/authz/CasbinAdapter'
import { canAssignUserRole } from '@/authz/payloadAccess'
import type { AuthorizationRequest, AuthorizationSubject } from '@/authz/AuthorizationAdapter'

const subject = (role: string, id = 'user-1', accountStatus = 'active'): AuthorizationSubject => ({
  id,
  role,
  accountStatus,
})

const request = (
  user: AuthorizationSubject,
  action: string,
  resourceType: string,
  attributes: Record<string, unknown> = {},
  context: AuthorizationRequest['context'] = {},
): AuthorizationRequest => ({
  subject: user,
  action,
  resource: {
    type: resourceType,
    attributes: { ownerId: null, tenantId: null, ...attributes },
  },
  context: { tenantId: null, ...context },
})

describe('Casbin authorization adapter', () => {
  let adapter: CasbinAdapter

  beforeAll(async () => {
    adapter = await CasbinAdapter.create()
  })

  it('allows a super admin protected access', async () => {
    expect(await adapter.isAllowed(request(subject('super_admin'), 'read', 'users'))).toBe(true)
  })

  it('allows admins to assign non-privileged roles but not privileged roles', async () => {
    expect(await adapter.isAllowed(request(subject('admin'), 'assign_role', 'users'))).toBe(true)
    expect(await adapter.isAllowed(request(subject('admin'), 'assign_privileged_role', 'users'))).toBe(false)
  })


  it('enforces role assignment rules used by the Users field access control', async () => {
    expect(await canAssignUserRole(subject('admin'), 'content_author', 'user-2')).toBe(true)
    expect(await canAssignUserRole(subject('admin'), 'admin', 'user-2')).toBe(false)
    expect(await canAssignUserRole(subject('super_admin'), 'admin', 'user-2')).toBe(true)
    expect(await canAssignUserRole(subject('admin'), 'content_editor', 'user-1')).toBe(false)
  })

  it('allows content authors to update owned content only', async () => {
    expect(
      await adapter.isAllowed(
        request(subject('content_author'), 'update', 'content', { ownerId: 'user-1' }),
      ),
    ).toBe(true)
    expect(
      await adapter.isAllowed(
        request(subject('content_author'), 'update', 'content', { ownerId: 'user-2' }),
      ),
    ).toBe(false)
  })

  it('allows subscribers to read their own account resource', async () => {
    expect(
      await adapter.isAllowed(
        request(subject('subscriber'), 'read', 'account', { ownerId: 'user-1' }),
      ),
    ).toBe(true)
  })

  it('denies suspended and pending users', async () => {
    expect(
      await adapter.isAllowed(request(subject('admin', 'user-1', 'suspended'), 'read', 'users')),
    ).toBe(false)
    expect(
      await adapter.isAllowed(request(subject('subscriber', 'user-1', 'pending'), 'read', 'account', { ownerId: 'user-1' })),
    ).toBe(false)
  })

  it('denies unknown roles and unmatched actions by default', async () => {
    expect(await adapter.isAllowed(request(subject('unknown_role'), 'read', 'users'))).toBe(false)
    expect(await adapter.isAllowed(request(subject('content_author'), 'delete', 'content'))).toBe(false)
  })

  it('denies self role changes even when the role otherwise permits assignment', async () => {
    expect(
      await adapter.isAllowed(
        request(subject('admin'), 'assign_role', 'users', { ownerId: 'user-1' }, { targetIsSelf: true }),
      ),
    ).toBe(false)
  })
})
