import type { CollectionConfig } from 'payload'

import { authorizePayloadUser, createAdminOnlyAccess } from '../authz/payloadAccess'

const adminAccess = createAdminOnlyAccess('banners')

export const Banners: CollectionConfig = {
  slug: 'banners',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'status', 'displayOrder'] },
  access: {
    ...adminAccess,
    read: async ({ req }) => {
      if (await authorizePayloadUser(req.user, {
        action: 'read', resource: { type: 'banners', attributes: { ownerId: null, tenantId: null } },
      })) return true
      return { status: { equals: 'active' } }
    },
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'image', type: 'relationship', relationTo: 'media', required: true },
    { name: 'heading', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'ctaLabel', type: 'text' },
    { name: 'ctaURL', type: 'text' },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'inactive',
      options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }],
    },
    { name: 'displayOrder', type: 'number', required: true, defaultValue: 0, min: 0 },
  ],
}
