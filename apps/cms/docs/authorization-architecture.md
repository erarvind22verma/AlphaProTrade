# Authorization architecture

## Provisional choice: Node-Casbin

Node-Casbin is used provisionally because its policy model can express role-based access control (RBAC) and attribute-based checks (ABAC) while keeping authorization behind an application-owned AuthorizationAdapter interface. The app depends on that interface, not on Casbin's types outside the adapter, so another engine can replace it later.

The current model and initial policy are in src/authz/model.conf and src/authz/policy.csv. No policy is granted unless it matches an explicit allow rule. The adapter also rejects missing/unknown identity data and fails closed if policy evaluation errors.

## RBAC and ABAC

RBAC grants permissions through named roles: super_admin, admin, content_author, content_editor, content_approver, subscriber, and trader.

ABAC narrows those grants using request attributes. The initial model requires an active account, supports ownership checks using resource.attributes.ownerId, and requires the request tenant to match the resource tenant. It also blocks role and account-status changes to the acting user's own account. Tenant and content workflow behavior are scaffolding only; those product features are not implemented in Phase 1.

## Payload integration

src/authz/payloadAccess.ts maps Payload's authenticated user to the authorization subject and calls the current adapter. The Users collection keeps auth: true and adds collection-level access functions plus field-level controls:

- New public registrations are forced to the subscriber role and pending account status.
- Public requests cannot set a role or account status.
- Only an admin can assign non-privileged roles or change another user's account status.
- Only a super admin can assign admin or super_admin.
- No user can change their own role or account status.
- Suspended and pending accounts are denied protected operations by the Casbin model.
- Users without a recognized role receive no matching policy and are denied.

This protects Payload server requests. Frontend permission checks, if added later, are presentation only and are never authorization enforcement. Payload Local API calls skip access checks by default; application server code must pass the authenticated user and set overrideAccess to false. Any trusted bootstrap or test fixture that bypasses checks must be explicit and must not be reachable as a request handler.

## Replacing the adapter

Callers use the AuthorizationAdapter interface in src/authz/AuthorizationAdapter.ts. To replace Casbin, implement isAllowed in a new adapter, switch getCasbinAdapter usage in src/authz/payloadAccess.ts to the replacement provider, and preserve the same deny-by-default and test behavior. Payload collection and field access code should not need to know which engine is underneath.

## Not implemented

- Subscription records, subscription lifecycle, or entitlement checks.
- Content collections or an editorial review, approval, and publishing workflow.
- The separate React customer frontend.
- Persistent or dynamically administered Casbin policies; Phase 1 policy is file-based.
- Subscription records, entitlement checks, and subscription seed data.
- PostgreSQL provisioning or database connectivity verification.

The CMS uses the PostgreSQL adapter and reads DATABASE_URL, but Phase 1 does not start or provision PostgreSQL. When the database is unavailable, start a dedicated PostgreSQL instance for this project, create the configured database/user, and set DATABASE_URL to its reachable host and port. The local example uses port 5433; do not reuse or alter another project's database or containers.
