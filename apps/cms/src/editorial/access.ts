import type { Access, AccessResult, Where } from 'payload'

import { authorizePayloadUser, toAuthorizationSubject } from '../authz/payloadAccess'

const contentResource = (ownerId: string | number | null) => ({
  type: 'content',
  attributes: { ownerId, tenantId: null },
})

export const readEditorialContent: Access = async ({ req }): Promise<AccessResult> => {
  const subject = toAuthorizationSubject(req.user)
  const publishedOnly: Where = {
    and: [{ workflowStatus: { equals: 'published' } }, { _status: { equals: 'published' } }],
  }
  if (!subject) return publishedOnly

  const globalRead = await authorizePayloadUser(req.user, {
    action: 'read',
    resource: contentResource(null),
  })
  if (globalRead) return true

  const ownRead = await authorizePayloadUser(req.user, {
    action: 'read',
    resource: contentResource(subject.id),
    context: { targetIsSelf: false, tenantId: null },
  })
  if (ownRead) return { or: [{ author: { equals: subject.id } }, publishedOnly] }
  return publishedOnly
}

export const createEditorialContent: Access = async ({ req }) => {
  const subject = toAuthorizationSubject(req.user)
  if (!subject) return false
  return authorizePayloadUser(req.user, {
    action: 'create',
    resource: contentResource(subject.id),
  })
}

async function getDocumentAccessContext(req: any, collection: 'pages' | 'news', id: string | number | undefined) {
  if (id === undefined) return null
  try {
    const doc = await req.payload.findByID({ collection, id, depth: 0, overrideAccess: true })
    const author = doc.author
    return {
      ownerId: author && typeof author === 'object' && 'id' in author ? author.id : author,
      workflowStatus: doc.workflowStatus,
    }
  } catch {
    return null
  }
}

export function createEditorialRecordAccess(collection: 'pages' | 'news', action: 'update' | 'delete'): Access {
  return async ({ req, id }) => {
    const subject = toAuthorizationSubject(req.user)
    if (!subject) return false
    const allAllowed = await authorizePayloadUser(req.user, {
      action,
      resource: contentResource(null),
    })
    if (allAllowed) return true

    if (id === undefined) {
      const ownAllowed = await authorizePayloadUser(req.user, {
        action,
        resource: contentResource(subject.id),
      })
      if (!ownAllowed || action !== 'update') return false
      const ownDrafts: Where = {
        and: [
          { author: { equals: subject.id } },
          { workflowStatus: { in: ['draft', 'changes_requested'] } },
        ],
      }
      return ownDrafts
    }

    const document = await getDocumentAccessContext(req, collection, id)
    if (!document) return false
    if (
      action === 'update' &&
      !['draft', 'changes_requested'].includes(String(document.workflowStatus))
    ) return false

    return authorizePayloadUser(req.user, {
      action,
      resource: contentResource((document.ownerId as string | number | null | undefined) ?? null),
    })
  }
}

export const blockDirectWorkflowStatusChange = ({ data, originalDoc, operation, req }: any) => {
  const context = req?.context as {
    editorialWorkflowTransition?: unknown
    editorialInitialDraft?: unknown
  } | undefined
  if (context?.editorialWorkflowTransition === true || context?.editorialInitialDraft === true) return data
  // On create, secureEditorialIdentityFields forces draft values. There is no
  // previous state to protect until an existing document is being updated.
  if (operation !== 'update' || !originalDoc) return data
  if (data?.workflowStatus !== undefined && data.workflowStatus !== originalDoc?.workflowStatus) {
    throw new Error('Workflow status changes must use the editorial transition endpoint')
  }
  if (data?._status !== undefined && data._status !== originalDoc?._status) {
    throw new Error('Payload publication status changes must use the editorial transition endpoint')
  }
  return data
}

export const secureEditorialIdentityFields = ({ data, operation, originalDoc, req }: any) => {
  if (!data) return data
  const context = req?.context as {
    editorialWorkflowTransition?: unknown
    editorialInitialDraft?: unknown
  } | undefined
  if (context?.editorialWorkflowTransition === true) return data

  if (operation === 'create') {
    if (data.workflowStatus !== undefined && data.workflowStatus !== 'draft') {
      throw new Error('New editorial content must start as a draft')
    }
    if (data._status !== undefined && data._status !== 'draft') {
      throw new Error('New Payload versions must start as a draft')
    }
    req.context = { ...req.context, editorialInitialDraft: true }
    return {
      ...data,
      author: req.user?.id,
      workflowStatus: 'draft',
      _status: 'draft',
      editor: null,
      approver: null,
      publishedAt: null,
    }
  }

  if (data.workflowStatus !== undefined && data.workflowStatus !== originalDoc?.workflowStatus) {
    throw new Error('Workflow status changes must use the editorial transition endpoint')
  }
  return {
    ...data,
    author: originalDoc?.author,
    editor: originalDoc?.editor,
    approver: originalDoc?.approver,
    workflowStatus: originalDoc?.workflowStatus,
    _status: originalDoc?._status,
    workflowEvents: originalDoc?.workflowEvents,
    submittedAt: originalDoc?.submittedAt,
    publishedAt: originalDoc?.publishedAt,
  }
}
