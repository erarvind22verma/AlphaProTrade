import type { CollectionConfig } from 'payload'

import {
  blockDirectWorkflowStatusChange,
  createEditorialContent,
  createEditorialRecordAccess,
  readEditorialContent,
  secureEditorialIdentityFields,
} from '../editorial/access'
import { createWorkflowTransitionEndpoint } from '../editorial/workflow'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', 'workflowStatus', 'author', 'publishedAt'] },
  versions: { drafts: true },
  access: {
    create: createEditorialContent,
    read: readEditorialContent,
    update: createEditorialRecordAccess('pages', 'update'),
    delete: createEditorialRecordAccess('pages', 'delete'),
  },
  hooks: {
    beforeValidate: [secureEditorialIdentityFields],
    beforeChange: [blockDirectWorkflowStatusChange],
  },
  endpoints: [createWorkflowTransitionEndpoint('pages')],
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'content',
      type: 'blocks',
      blocks: [
        { slug: 'richText', fields: [{ name: 'body', type: 'richText', required: true }] },
        {
          slug: 'image',
          fields: [
            { name: 'image', type: 'relationship', relationTo: 'media', required: true },
            { name: 'caption', type: 'text' },
          ],
        },
        {
          slug: 'quote',
          fields: [
            { name: 'quote', type: 'textarea', required: true },
            { name: 'attribution', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'image', type: 'relationship', relationTo: 'media' },
      ],
    },
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
