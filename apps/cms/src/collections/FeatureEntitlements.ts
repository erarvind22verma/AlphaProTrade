import type { CollectionConfig } from 'payload'

import { createAdminOnlyAccess } from '../authz/payloadAccess'

export const FeatureEntitlements: CollectionConfig = {
  slug: 'feature-entitlements',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['plan', 'feature', 'status'],
  },
  access: createAdminOnlyAccess('feature-entitlements'),
  fields: [
    {
      name: 'plan',
      type: 'relationship',
      relationTo: 'subscription-plans',
      required: true,
      index: true,
    },
    {
      name: 'feature',
      type: 'relationship',
      relationTo: 'features',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
    },
  ],
}
