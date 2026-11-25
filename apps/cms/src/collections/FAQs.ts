import type { CollectionConfig } from 'payload'

import { authorizePayloadUser, createAdminOnlyAccess } from '../authz/payloadAccess'

const adminAccess = createAdminOnlyAccess('faqs')

export const FAQs: CollectionConfig = {
  slug: 'faqs',
  admin: { useAsTitle: 'question', defaultColumns: ['question', 'category', 'status', 'displayOrder'] },
  access: {
    ...adminAccess,
    read: async ({ req }) => {
      if (await authorizePayloadUser(req.user, {
        action: 'read', resource: { type: 'faqs', attributes: { ownerId: null, tenantId: null } },
      })) return true
      return { status: { equals: 'active' } }
    },
  },
  fields: [
    { name: 'question', type: 'text', required: true },
    { name: 'answer', type: 'richText', required: true },
    { name: 'category', type: 'text', required: true, index: true },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'inactive',
      options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }],
    },
    { name: 'displayOrder', type: 'number', required: true, defaultValue: 0, min: 0 },
  ],
}
