import type { CollectionConfig } from 'payload'

import { createAdminOnlyAccess } from '../authz/payloadAccess'
import { toAuthorizationSubject } from '../authz/payloadAccess'

export const UserSubscriptions: CollectionConfig = {
  slug: 'user-subscriptions',
  admin: {
    useAsTitle: 'status',
    defaultColumns: ['user', 'plan', 'status', 'startDate', 'endDate'],
  },
  access: createAdminOnlyAccess('user-subscriptions'),
  endpoints: [
    {
      path: '/me',
      method: 'get',
      handler: async (req) => {
        const subject = toAuthorizationSubject(req.user)
        if (!subject) return Response.json({ error: 'Authentication required' }, { status: 401 })
        const result = await req.payload.find({
          collection: 'user-subscriptions',
          where: { and: [{ user: { equals: subject.id } }, { status: { equals: 'active' } }] },
          sort: '-startDate',
          limit: 20,
          depth: 1,
          overrideAccess: true,
        })
        const now = Date.now()
        const subscription = result.docs.find((doc) => {
          const start = Date.parse(doc.startDate)
          const end = doc.endDate ? Date.parse(doc.endDate) : Number.POSITIVE_INFINITY
          const plan = doc.plan
          return Number.isFinite(start) && start <= now && now < end &&
            !!plan && typeof plan === 'object' && plan.status === 'active'
        })
        return Response.json({ subscription: subscription ?? null })
      },
    },
  ],
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'plan',
      type: 'relationship',
      relationTo: 'subscription-plans',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pending', value: 'pending' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Expired', value: 'expired' },
        { label: 'Suspended', value: 'suspended' },
      ],
    },
    { name: 'startDate', type: 'date', required: true },
    { name: 'endDate', type: 'date' },
    {
      name: 'upgradeHistory',
      type: 'array',
      fields: [
        {
          name: 'fromPlan',
          type: 'relationship',
          relationTo: 'subscription-plans',
          required: true,
        },
        {
          name: 'toPlan',
          type: 'relationship',
          relationTo: 'subscription-plans',
          required: true,
        },
        { name: 'changedAt', type: 'date', required: true, defaultValue: () => new Date() },
        {
          name: 'changedBy',
          type: 'relationship',
          relationTo: 'users',
        },
        { name: 'notes', type: 'textarea' },
      ],
    },
  ],
}
