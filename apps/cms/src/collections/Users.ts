import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { ACCOUNT_STATUSES, USER_ROLES } from '../authz/AuthorizationAdapter'
import { authorizePayloadUser, canAssignUserRole, sameUserID, toAuthorizationSubject } from '../authz/payloadAccess'

const resourceForUser = (id: string | number | undefined) => ({
  type: 'users',
  id,
  attributes: {
    ownerId: id ?? null,
    tenantId: null,
  },
})

const canManageAllUsers = async (user: unknown, action: string) =>
  authorizePayloadUser(user, {
    action,
    resource: { type: 'users', attributes: { ownerId: null, tenantId: null } },
  })

const readUsers: Access = async ({ req, id }) => {
  const subject = toAuthorizationSubject(req.user)
  if (!subject) return false

  if (await canManageAllUsers(req.user, 'read')) return true

  if (id !== undefined) {
    return authorizePayloadUser(req.user, {
      action: 'read',
      resource: resourceForUser(id),
      context: { targetIsSelf: sameUserID(subject.id, id), tenantId: null },
    })
  }

  const canReadSelf = await authorizePayloadUser(req.user, {
    action: 'read',
    resource: resourceForUser(subject.id),
    context: { targetIsSelf: true, tenantId: null },
  })

  return canReadSelf ? { id: { equals: subject.id } } : false
}

const updateUsers: Access = async ({ req, id }) => {
  const subject = toAuthorizationSubject(req.user)
  if (!subject) return false

  if (await canManageAllUsers(req.user, 'update')) return true

  if (id !== undefined) {
    return authorizePayloadUser(req.user, {
      action: 'update',
      resource: resourceForUser(id),
      context: { targetIsSelf: sameUserID(subject.id, id), tenantId: null },
    })
  }

  const canUpdateSelf = await authorizePayloadUser(req.user, {
    action: 'update',
    resource: resourceForUser(subject.id),
    context: { targetIsSelf: true, tenantId: null },
  })

  return canUpdateSelf ? { id: { equals: subject.id } } : false
}

const deleteUsers: Access = async ({ req }) => canManageAllUsers(req.user, 'delete')

const roleAccess: FieldAccess = async ({ req, id, data, doc }) =>
  canAssignUserRole(req.user, data?.role ?? doc?.role, id)

const accountStatusAccess: FieldAccess = async ({ req, id }) => {
  const subject = toAuthorizationSubject(req.user)
  if (!subject || sameUserID(subject.id, id)) return false

  return authorizePayloadUser(req.user, {
    action: 'manage_user_status',
    resource: resourceForUser(id),
    context: { targetIsSelf: false, tenantId: null },
  })
}

const accountStatusReadAccess: FieldAccess = async ({ req, id }) => {
  const subject = toAuthorizationSubject(req.user)
  if (!subject) return false

  if (await canManageAllUsers(req.user, 'read')) return true
  return sameUserID(subject.id, id)
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    // Public registration is allowed only as a pending subscriber; field access
    // and the hook below prevent clients from choosing privileged values.
    create: () => true,
    read: readUsers,
    update: updateUsers,
    delete: deleteUsers,
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, req }) => {
        const trustedBootstrap = req.context?.alphaProTradeBootstrap === true
        if (operation === 'create' && !req.user && !trustedBootstrap && data) {
          return { ...data, role: 'subscriber', accountStatus: 'pending' }
        }
        return data
      },
    ],
  },
  endpoints: [
    {
      path: '/permissions',
      method: 'get',
      handler: async (req) => {
        const subject = toAuthorizationSubject(req.user)
        if (!subject) return Response.json({ error: 'Authentication required' }, { status: 401 })

        const can = (action: string, resource: string, ownerId: string | number | null = null) =>
          authorizePayloadUser(req.user, {
            action,
            resource: { type: resource, attributes: { ownerId, tenantId: null } },
          })

        const checks = await Promise.all(Object.entries({
          readUsers: can('read', 'users'),
          readPlans: can('read', 'subscription-plans'),
          readFeatures: can('read', 'features'),
          readEntitlements: can('read', 'feature-entitlements'),
          readSubscriptions: can('read', 'user-subscriptions'),
          readContent: can('read', 'content', subject.id),
          readAllContent: can('read', 'content'),
          reviewContent: can('review', 'content', subject.id),
          requestChanges: can('request_changes', 'content'),
          approveContent: can('approve', 'content'),
          publishContent: can('publish', 'content'),
        }).map(([key, promise]) => promise.then((value) => [key, value] as const)))
        const permissions = Object.fromEntries(checks)
        return Response.json({ user: subject, permissions })
      },
    },
  ],
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'subscriber',
      options: USER_ROLES.map((value) => ({ label: value.replaceAll('_', ' '), value })),
      access: {
        create: roleAccess,
        read: async ({ req, id }) => {
          const subject = toAuthorizationSubject(req.user)
          if (!subject) return false
          if (await canManageAllUsers(req.user, 'read')) return true
          return sameUserID(subject.id, id)
        },
        update: roleAccess,
      },
    },
    {
      name: 'accountStatus',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: ACCOUNT_STATUSES.map((value) => ({ label: value, value })),
      access: {
        create: accountStatusAccess,
        read: accountStatusReadAccess,
        update: accountStatusAccess,
      },
    },
  ],
}
