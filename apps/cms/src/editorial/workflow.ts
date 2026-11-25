import type { Payload } from 'payload'

import { authorizePayloadUser, toAuthorizationSubject } from '../authz/payloadAccess'

export const WORKFLOW_STATUSES = [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
] as const

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]
export type EditorialCollection = 'pages' | 'news'

const transitions: Record<WorkflowStatus, Partial<Record<WorkflowStatus, string>>> = {
  draft: { in_review: 'review' },
  in_review: { changes_requested: 'request_changes', approved: 'approve' },
  changes_requested: { in_review: 'review' },
  approved: { published: 'publish' },
  published: {},
}

const idOf = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

export async function transitionEditorialContent(args: {
  payload: Payload
  collection: EditorialCollection
  id: string | number
  target: WorkflowStatus
  actor: unknown
  note?: string
}): Promise<{ ok: true; doc: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const subject = toAuthorizationSubject(args.actor)
  if (!subject) return { ok: false, status: 401, error: 'Authentication required' }
  if (!WORKFLOW_STATUSES.includes(args.target)) return { ok: false, status: 400, error: 'Unknown workflow status' }

  let doc: Record<string, unknown>
  try {
    doc = (await args.payload.findByID({
      collection: args.collection,
      id: args.id as never,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  } catch {
    return { ok: false, status: 404, error: 'Content not found' }
  }

  const current = doc.workflowStatus
  if (typeof current !== 'string' || !WORKFLOW_STATUSES.includes(current as WorkflowStatus)) {
    return { ok: false, status: 409, error: 'Content has an invalid workflow status' }
  }
  const action = transitions[current as WorkflowStatus][args.target]
  if (!action) return { ok: false, status: 409, error: `Transition ${current} to ${args.target} is not allowed` }

  const authorId = idOf(doc.author)
  if (args.target === 'approved' && authorId !== null && String(authorId) === String(subject.id)) {
    return { ok: false, status: 403, error: 'Authors cannot approve their own content' }
  }

  const allowed = await authorizePayloadUser(args.actor, {
    action,
    resource: {
      type: 'content',
      id: doc.id as string | number,
      attributes: { ownerId: authorId, tenantId: null, contentCollection: args.collection },
    },
    context: { tenantId: null },
  })
  if (!allowed) return { ok: false, status: 403, error: 'Not authorized for this workflow action' }

  const now = new Date().toISOString()
  const event = {
    action,
    from: current,
    to: args.target,
    actor: subject.id,
    occurredAt: now,
    note: args.note?.slice(0, 2000) || undefined,
  }
  const previousEvents = Array.isArray(doc.workflowEvents) ? doc.workflowEvents : []
  const data: Record<string, unknown> = {
    workflowStatus: args.target,
    _status: args.target === 'published' ? 'published' : 'draft',
    workflowEvents: [...previousEvents, event],
  }
  if (args.target === 'in_review' && current === 'draft') data.submittedAt = now
  if (args.target === 'changes_requested' || args.target === 'approved') data.editor = subject.id
  if (args.target === 'approved') data.approver = subject.id
  if (args.target === 'published') data.publishedAt = now

  try {
    const updated = await args.payload.update({
      collection: args.collection,
      id: args.id as never,
      data: data as never,
      draft: false,
      overrideAccess: true,
      user: args.actor as never,
      context: { editorialWorkflowTransition: true },
    })
    return { ok: true, doc: updated as unknown as Record<string, unknown> }
  } catch {
    return { ok: false, status: 500, error: 'Could not record workflow transition' }
  }
}

export function createWorkflowTransitionEndpoint(collection: EditorialCollection) {
  return {
    path: '/transition',
    method: 'post' as const,
    handler: async (req: any) => {
      if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 })
      let body: Record<string, unknown>
      try {
        body = await req.json()
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      if (
        (typeof body.id !== 'string' && typeof body.id !== 'number') ||
        typeof body.status !== 'string' ||
        (body.note !== undefined && typeof body.note !== 'string')
      ) {
        return Response.json({ error: 'Expected id, status, and optional note' }, { status: 400 })
      }
      const result = await transitionEditorialContent({
        payload: req.payload,
        collection,
        id: body.id,
        target: body.status as WorkflowStatus,
        actor: req.user,
        note: body.note as string | undefined,
      })
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
      return Response.json({ doc: result.doc })
    },
  }
}
