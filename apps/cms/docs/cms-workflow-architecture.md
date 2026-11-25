# CMS content and editorial workflow

## Collections

- **Pages** stores structured block content, SEO metadata, author/editor/approver relationships, workflow timestamps, and the event history. Payload draft versions are enabled.
- **News** stores a summary, Lexical body, optional Media image, authorship, workflow fields, and draft versions.
- **Banners** stores a Media relationship, copy, CTA, active status, and display order.
- **FAQs** stores question and answer content, category, active status, and display order.

The existing Media collection remains the shared upload source for page blocks, SEO images, news images, and banners. Banners and FAQs are managed by authorized administrators; unauthenticated reads are filtered to active records.

## Roles and actions

Authorization is delegated to the existing `AuthorizationAdapter` (Casbin in this POC). Content access uses a shared `content` resource and the persisted author relationship as its owner attribute.

| Role | Editorial permissions |
| --- | --- |
| `content_author` | Create drafts, read own drafts, update own content, submit or resubmit for review |
| `content_editor` | Read/update content, review submissions, request changes |
| `content_approver` | Read content and approve submissions authored by someone else |
| `admin` | Publish approved content and administer banners/FAQs |
| `super_admin` | Existing broad Casbin access, with the self-approval rule still enforced by the workflow service |

The author role is not given approval or publication permissions. Editors cannot approve; approvers cannot publish. Publication is reserved for administrators after approval.

## States and transitions

```text
Draft --author/editor: review--> In Review
In Review --editor: request changes--> Changes Requested
Changes Requested --author/editor: review--> In Review
In Review --approver (not author): approve--> Approved
Approved --admin/super_admin: publish--> Published
```

The server transition endpoint is `POST /api/pages/transition` or `POST /api/news/transition`, with JSON `{ "id": 123, "status": "in_review", "note": "Optional note" }`. The server loads the record, validates the current and target states, rejects self-approval, asks the adapter for the required action, then updates the record and appends an event containing action, from/to states, actor, timestamp, and optional note. The stored field is `workflowStatus`; Payload's built-in `_status` is separately changed to `published` only at the final publish step.

Direct status changes on normal collection create/update requests are rejected by the collection hook. Creation always starts as a draft and assigns the authenticated user as author. Author/editor/approver identities and workflow events cannot be changed by regular content edits. The transition endpoint is the only supported state-changing path.

## API visibility

Unauthenticated collection reads for Pages and News require both `workflowStatus = published` and Payload `_status = published`. Authors can read their own records plus published content. Editors, approvers, and administrators get broader access only when allowed by Casbin. The same collection access rules apply to the Payload REST/GraphQL collection APIs, rather than relying on frontend filtering. Draft version endpoints remain subject to Payload access controls.

Workflow transitions require an authenticated user. Invalid transitions return a conflict response; missing authentication returns 401; unauthorized actions and self-approval return 403. Missing records return 404. Banners and FAQs expose active entries to public reads, while their writes remain admin-only.

## Tests

The editorial unit tests cover author ownership, review/change request/resubmission, approval and publication, self-approval rejection, invalid and unauthorized transitions, direct status mutation rejection, event creation, and published-only anonymous reads. They use an in-memory Payload-shaped repository and Casbin; they do not require PostgreSQL.

## Limitations

- This is a POC workflow, not a configurable workflow engine.
- `admin` is the publisher role because Phase 1 does not define a separate publisher role.
- Workflow events are append-only through this application path, but database-level immutable audit controls are not configured.
- There is no notification, scheduled publishing, localization, preview frontend, or React implementation in this phase.
- Payload `versions.drafts` is used alongside the application-owned `workflowStatus`; those are distinct concepts.
- PostgreSQL persistence/API integration requires an available database and is not established by the in-memory workflow tests.
