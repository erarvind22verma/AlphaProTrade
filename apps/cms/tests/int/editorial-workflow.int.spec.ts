import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CasbinAdapter } from '@/authz/CasbinAdapter'
import { blockDirectWorkflowStatusChange, readEditorialContent, secureEditorialIdentityFields } from '@/editorial/access'
import { transitionEditorialContent } from '@/editorial/workflow'

type TestDoc = Record<string, unknown> & { id: number; workflowStatus: string; author: number | string; workflowEvents?: unknown[] }

class MemoryPayload {
  docs = new Map<number, TestDoc>()
  async findByID({ id }: { id: number }): Promise<TestDoc> {
    const doc = this.docs.get(id)
    if (!doc) throw new Error('missing')
    return structuredClone(doc)
  }
  async update({ id, data }: { id: number; data: Partial<TestDoc> }): Promise<TestDoc> {
    const doc = this.docs.get(id)
    if (!doc) throw new Error('missing')
    const updated = { ...doc, ...data } as TestDoc
    this.docs.set(id, updated)
    return structuredClone(updated)
  }
}

const user = (id: number, role: string, accountStatus = 'active') => ({ id, role, accountStatus })

describe('editorial workflow', () => {
  let adapter: CasbinAdapter
  let payload: MemoryPayload

  beforeAll(async () => { adapter = await CasbinAdapter.create() })
  beforeEach(() => {
    payload = new MemoryPayload()
    payload.docs.set(11, { id: 11, workflowStatus: 'draft', author: 1, workflowEvents: [] })
  })

  const transition = (target: string, actor: unknown, note?: string) => transitionEditorialContent({
    payload: payload as never,
    collection: 'pages',
    id: 11,
    target: target as never,
    actor,
    note,
  })

  it('lets an author submit and edit only their own draft', async () => {
    const result = await transition('in_review', user(1, 'content_author'))
    expect(result.ok).toBe(true)
    expect(payload.docs.get(11)?.workflowStatus).toBe('in_review')
    expect(payload.docs.get(11)?.workflowEvents).toHaveLength(1)
    expect(await adapter.isAllowed({
      subject: { id: 1, role: 'content_author', accountStatus: 'active' },
      action: 'update',
      resource: { type: 'content', attributes: { ownerId: 1, tenantId: null } },
    })).toBe(true)
    expect(await adapter.isAllowed({
      subject: { id: 2, role: 'content_author', accountStatus: 'active' },
      action: 'update',
      resource: { type: 'content', attributes: { ownerId: 1, tenantId: null } },
    })).toBe(false)
  })

  it('allows editors to request changes and authors to resubmit', async () => {
    payload.docs.set(11, { id: 11, workflowStatus: 'in_review', author: 1, workflowEvents: [] })
    expect((await transition('changes_requested', user(2, 'content_editor'), 'Clarify the summary')).ok).toBe(true)
    expect((await transition('in_review', user(1, 'content_author'))).ok).toBe(true)
    expect(payload.docs.get(11)?.workflowEvents).toHaveLength(2)
  })

  it('allows an approver to approve another author’s content and an admin to publish', async () => {
    payload.docs.set(11, { id: 11, workflowStatus: 'in_review', author: 1, workflowEvents: [] })
    expect((await transition('approved', user(3, 'content_approver'))).ok).toBe(true)
    expect((await transition('published', user(4, 'admin'))).ok).toBe(true)
    expect(payload.docs.get(11)?.workflowStatus).toBe('published')
    expect(payload.docs.get(11)?.publishedAt).toBeTypeOf('string')
  })

  it('rejects self approval, unauthorized actions, and invalid state transitions', async () => {
    payload.docs.set(11, { id: 11, workflowStatus: 'in_review', author: 1, workflowEvents: [] })
    expect(await transition('approved', user(1, 'content_approver'))).toMatchObject({ ok: false, status: 403 })
    expect(await transition('approved', user(2, 'content_editor'))).toMatchObject({ ok: false, status: 403 })
    expect(await transition('published', user(4, 'admin'))).toMatchObject({ ok: false, status: 409 })
    expect(await transition('published', user(5, 'content_author'))).toMatchObject({ ok: false, status: 409 })
  })

  it('rejects anonymous or unauthorized transitions', async () => {
    expect(await transition('in_review', null)).toMatchObject({ ok: false, status: 401 })
    expect(await transition('in_review', user(2, 'subscriber'))).toMatchObject({ ok: false, status: 403 })
    expect(await transition('unknown', user(1, 'content_author'))).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects direct status updates outside the workflow endpoint', () => {
    expect(() => blockDirectWorkflowStatusChange({
      data: { workflowStatus: 'published' }, originalDoc: { workflowStatus: 'draft' }, operation: 'update', req: { context: {} },
    })).toThrow(/transition endpoint/i)
    expect(blockDirectWorkflowStatusChange({
      data: { workflowStatus: 'published' }, originalDoc: { workflowStatus: 'draft' },
      req: { context: { editorialWorkflowTransition: true } },
    })).toEqual({ workflowStatus: 'published' })
  })

  it('allows new records to start as drafts while rejecting published creation input', () => {
    const req = { context: {} as Record<string, unknown> }
    const draft = secureEditorialIdentityFields({ data: { title: 'Draft' }, operation: 'create', req })
    expect(draft).toMatchObject({ workflowStatus: 'draft', _status: 'draft' })
    expect(blockDirectWorkflowStatusChange({
      data: draft,
      originalDoc: { workflowStatus: 'draft', _status: 'draft' },
      operation: 'update',
      req,
    })).toEqual(draft)
    expect(() => secureEditorialIdentityFields({
      data: { workflowStatus: 'published' },
      operation: 'create',
      req: { context: {} },
    })).toThrow(/must start as a draft/i)
  })

  it('limits anonymous public reads to published content', async () => {
    const filter = await readEditorialContent({ req: { user: null } } as never)
    expect(filter).toEqual({ and: [{ workflowStatus: { equals: 'published' } }, { _status: { equals: 'published' } }] })
    const authorFilter = await readEditorialContent({ req: { user: user(1, 'content_author') } } as never)
    expect(authorFilter).toEqual({
      or: [
        { author: { equals: 1 } },
        { and: [{ workflowStatus: { equals: 'published' } }, { _status: { equals: 'published' } }] },
      ],
    })
  })
})
