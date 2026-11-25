import type { CollectionConfig } from 'payload'

import {
  blockDirectWorkflowStatusChange,
  createEditorialContent,
  createEditorialRecordAccess,
  readEditorialContent,
  secureEditorialIdentityFields,
} from '../editorial/access'
import { createWorkflowTransitionEndpoint } from '../editorial/workflow'

export const News: CollectionConfig = {
  slug: 'news',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'workflowStatus', 'author', 'publishedAt'] },
  versions: { drafts: true },
  access: {
    create: createEditorialContent,
    read: readEditorialContent,
    update: createEditorialRecordAccess('news', 'update'),
    delete: createEditorialRecordAccess('news', 'delete'),
  },
  hooks: {
    beforeValidate: [secureEditorialIdentityFields],
    beforeChange: [blockDirectWorkflowStatusChange],
  },
  endpoints: [createWorkflowTransitionEndpoint('news')],
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'summary', type: 'textarea', required: true },
    { name: 'content', type: 'richText', required: true },
    { name: 'featuredImage', type: 'relationship', relationTo: 'media' },
    {
      name: 'workflowStatus',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'in_review', 'changes_requested', 'approved', 'published'],
      access: { update: () => false },
    },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'editor', type: 'relationship', relationTo: 'users' },
    { name: 'approver', type: 'relationship', relationTo: 'users' },
    { name: 'submittedAt', type: 'date' },
    { name: 'publishedAt', type: 'date' },
    {
      name: 'workflowEvents',
      type: 'array',
      fields: [
        { name: 'action', type: 'text', required: true },
        { name: 'from', type: 'text', required: true },
        { name: 'to', type: 'text', required: true },
        { name: 'actor', type: 'relationship', relationTo: 'users', required: true },
        { name: 'occurredAt', type: 'date', required: true },
        { name: 'note', type: 'textarea' },
      ],
    },
  ],
}
