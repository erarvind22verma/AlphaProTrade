# AlphaProTrade — Developer Guide

This document is the local installation guide and technical onboarding reference for the AlphaProTrade proof of concept (POC). It reflects the checked-out source and local environment as of 26 November 2026; verify package manifests, migrations, and configuration after changes.

## Contents

- [Status](#status)
- [Technology versions](#technology-versions)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Collections and relationships](#collections-and-relationships)
- [Authentication and authorization](#authentication-and-authorization)
- [Subscriptions and entitlements](#subscriptions-and-entitlements)
- [Editorial workflow](#editorial-workflow)
- [API map](#api-map)
- [Local installation](#local-installation)
- [Migrations and seed data](#migrations-and-seed-data)
- [Common development tasks](#common-development-tasks)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)
- [Implemented and future work](#implemented-and-future-work)

## Status

This is one Git repository with two separately installable applications:

- `apps/cms`: Payload CMS, Admin UI, APIs, collections, and server-side business rules.
- `apps/web`: customer-facing React application. The checked-out source uses the Next.js App Router. That is a local source fact; it does not claim a planned production rollout/deployment is complete.
- PostgreSQL is the only Docker Compose service. Both Next.js apps run as Node.js host processes, not containers.

The web UI is custom AlphaProTrade code. This repo does **not** contain a full TailAdmin template/component tree or an installed shadcn/ui component library. It contains Tailwind styles, a local shadcn-compatible `Button`, `components.json`, and a TailAdmin MIT license notice. Those files do not mean full TailAdmin adoption is complete.

Implemented functionality includes Payload authentication, Casbin authorization, entitlements, plans, individual widget subscriptions, CMS collections, editorial transitions, and a five-widget demo UI. Purchases and all market figures are simulated. The public web slug route currently supports `/about`; general routing for every published Page slug is not implemented. Web admin tables are read-only; editing is through Payload Admin. There is no separate `publisher` role; `admin`/`super_admin` can publish.

## Technology versions

Versions are from the current local runtime/install. The manifests and app lock files are authoritative. There are separate lock files and no root pnpm workspace or root package scripts.

| Technology | Installed version | Purpose and communication |
| --- | --- | --- |
| Node.js | 24.22.3 | Runs both Next.js apps, scripts, and tests; host processes serve HTTP and connect to Postgres. |
| pnpm via Corepack | 10.23.0 used for verification | Installs dependencies separately per app; manifests allow pnpm 9, 10, 11. |
| React | 19.2.9 | UI for Payload Admin and customer app; browser UI calls Payload HTTP APIs. |
| Next.js | 16.4.6 | App Router/server in both apps. CMS/Admin/API on port 3000; web on 5173 with `/api/*` rewrite. |
| Payload CMS and `@payloadcms/*` packages | 3.94.1 | CMS, auth, collections, REST/GraphQL, Admin, access controls, hooks, and migrations. Connects to Postgres via the adapter. |
| `@payloadcms/db-postgres` | 3.94.1 | Payload PostgreSQL adapter; uses `DATABASE_URL`. `push: false` is configured, so schema changes use migrations. |
| PostgreSQL | 16.16 in verified local DB; Compose pins `postgres:16-alpine` by digest | Relational persistence. Host apps connect to `127.0.0.1:5433`, mapped to container port 5432. |
| Node-Casbin (`casbin`) | 5.51.1 | Server-side RBAC/ABAC-style policy evaluation. Adapter loads `model.conf`/`policy.csv`; Payload calls it through `AuthorizationAdapter`. |
| TypeScript | 5.7.3 | Static type checking for both apps, scripts, and tests. |
| Tailwind CSS | 4.3.5 | Web utility styling transformed by PostCSS in Next builds. |
| Vite | 7.3.8 (web test dependency) | Test transform/runtime used by Vitest; it does not serve the web application. |
| Vitest | 4.0.18 | Unit/integration-style tests in CMS and web. |
| Playwright | 1.63.0 | CMS browser tests; config starts/reuses `http://localhost:3000`. |
| Docker Engine / Compose | 29.5.2 / 5.1.4 | Containerize PostgreSQL only; Compose creates its port mapping, network, health check, and volume. |
| Git | 2.50.1 | Tracks both apps in one repo; dependency installs remain separate. |

Other installed libraries include `class-variance-authority` 0.7.1 and `lucide-react` 0.468.0 in web, `@testing-library/react` 16.3.0, and `jsdom` 28.0.0. shadcn/ui itself is not installed. Vite is not the web dev server; Vitest uses Vite's transform pipeline and CMS tests configure `@vitejs/plugin-react`.

## Architecture

```mermaid
flowchart LR
  Browser[Browser]
  Web[Customer UI<br/>Next.js + React<br/>localhost:5173]
  CMS[Payload CMS + Admin<br/>Next.js<br/>localhost:3000]
  DB[(PostgreSQL<br/>container port 5432)]
  Volume[(alphaprotrade-pgdata<br/>named volume)]
  Browser -->|web pages| Web
  Browser -->|Admin UI| CMS
  Web -->|same-origin /api/* rewrite<br/>PAYLOAD_URL| CMS
  CMS -->|DATABASE_URL<br/>host loopback 5433| DB
  DB --> Volume
```

The browser never connects directly to Postgres. `apps/web/next.config.ts` forwards same-origin `/api/*` requests to `PAYLOAD_URL` (default `http://localhost:3000`). Web requests include browser credentials, so Payload auth remains authoritative. Payload performs authentication, authorization, entitlement checks, validation, and persistence.

The CMS also retains the starter page at `/` in `apps/cms/src/app/(frontend)/page.tsx`. The separate customer app is `apps/web`; Payload Admin is normally `http://localhost:3000/admin`.

## Repository structure

```text
.
├── README.md
└── apps/
    ├── cms/
    │   ├── docker-compose.postgres.yml
    │   ├── package.json, pnpm-lock.yaml
    │   ├── docs/                 # Authorization, entitlement, workflow notes
    │   ├── scripts/              # Bootstrap and seed tools
    │   ├── src/
    │   │   ├── app/              # Payload Admin/API and starter route
    │   │   ├── authz/            # Adapter, model, policy, Payload access helpers
    │   │   ├── collections/      # Collection schemas, access, endpoints
    │   │   ├── editorial/        # Content permissions and transitions
    │   │   ├── migrations/       # Postgres migrations and metadata
    │   │   ├── subscriptions/    # Entitlement, repository, seed, billing rules
    │   │   └── payload.config.ts
    │   └── tests/{int,e2e,helpers}/
    └── web/
        ├── package.json, pnpm-lock.yaml
        ├── public/brand/         # Official AlphaProTrade logo assets
        └── src/
            ├── app/              # Next routes and global styles
            ├── components/       # Theme and local UI primitives
            ├── lib/              # Payload API client, session, demo fixtures
            ├── App.tsx           # Dashboard/content UI composition
            └── styles.css
```

Key paths: collection definitions in `apps/cms/src/collections/`; registration in `apps/cms/src/payload.config.ts`; authorization in `apps/cms/src/authz/`; entitlements in `apps/cms/src/subscriptions/`; workflow in `apps/cms/src/editorial/`; frontend API/session/UI in `apps/web/src/lib/` and `apps/web/src/App.tsx`.

## Collections and relationships

Payload collection slugs are REST routes under `/api`. Access functions run on the server; frontend visibility is not a security boundary.

| Collection | Purpose and relationships |
| --- | --- |
| `users` | Payload authentication, role, account status. Subscriptions are separate records. |
| `media` | Uploads with required alt text; Pages, News, and Banners can reference it. Reads are public. |
| `subscription-plans` | Basic/Premium/Enterprise records with demo price, currency, billing interval, and status. |
| `features` | Five widgets with stable code, category/status, individual monthly/yearly demo price fields. |
| `feature-entitlements` | Join between plan and feature, with active/inactive status. |
| `user-subscriptions` | Main subscription references one user and plan; status, dates, upgrade history. |
| `user-widget-subscriptions` | Individual widget subscription references user and feature; billing cycle, server-set price, paid period, status, cancellation date. Direct create/update/delete access is disabled. |
| `pages` | Structured blocks, SEO, media, author/editor/approver, Payload drafts/versions, workflow state/events. |
| `news` | Summary/rich text, featured media, editorial ownership, drafts/versions, workflow state/events. |
| `banners` | Text, media, CTA, active/inactive status, display order. |
| `faqs` | Rich-text answer, category, active/inactive status, display order. |

```mermaid
erDiagram
  USERS ||--o{ USER_SUBSCRIPTIONS : has
  SUBSCRIPTION_PLANS ||--o{ USER_SUBSCRIPTIONS : selected
  SUBSCRIPTION_PLANS ||--o{ FEATURE_ENTITLEMENTS : includes
  FEATURES ||--o{ FEATURE_ENTITLEMENTS : mapped
  USERS ||--o{ USER_WIDGET_SUBSCRIPTIONS : purchases
  FEATURES ||--o{ USER_WIDGET_SUBSCRIPTIONS : covers
  USERS ||--o{ PAGES : authors
  USERS ||--o{ NEWS : authors
  MEDIA ||--o{ PAGES : embeds
  MEDIA ||--o{ NEWS : illustrates
  MEDIA ||--o{ BANNERS : displays
```

Payload manages relationship identifiers in Postgres. Code uses populated relationships when it needs related fields and depth 0 when it needs IDs only.

## Authentication and authorization

### Authentication

`Users` (`apps/cms/src/collections/Users.ts`) is the only auth collection (`auth: true`). There is no second React authentication system. `apps/web/src/lib/api.ts` calls Payload's `POST /api/users/login`, `POST /api/users/logout`, and `GET /api/users/me`. Browser requests use `credentials: 'include'`; Payload's auth cookie is carried through the same-origin rewrite, not a separate frontend token store. `session.ts` stores UI state and clears it on logout/401.

Public user creation is enabled, but the Users `beforeValidate` hook forces anonymous registrations to `role: subscriber` and `accountStatus: pending`. Clients cannot self-assign a privileged role or active status. Pending/suspended users fail protected checks. The initial `super_admin` is created with a controlled CLI bootstrap, not a public elevation endpoint.

### Roles in the current code

| Role | Current policy behavior |
| --- | --- |
| `super_admin` | Broad access; self role/status changes remain blocked by model/field access. |
| `admin` | Manage users and subscription/config records, assign non-privileged roles, publish. Cannot assign `admin` or `super_admin`. |
| `content_author` | Create/read/update/submit own content; cannot approve own content. |
| `content_editor` | Read/update editorial content and request changes. |
| `content_approver` | Read and approve; self-approval is explicitly denied. |
| `subscriber` | Read own account and request plan changes; widgets require entitlements. |
| `trader` | Read own account and request plan changes; widgets require entitlements. |

There is no separate `publisher` role in the role constants or policy.

### Casbin flow

`AuthorizationAdapter.ts` is the replaceable app-owned interface. `CasbinAdapter.ts` implements it using Node-Casbin and loads `model.conf`/`policy.csv`. `payloadAccess.ts` converts Payload's user into a subject and calls the adapter. A check includes subject (id/role/account status), action, resource attributes (including owner id), and context (self/tenant). The model checks active status, matching policy, ownership scope, and tenant context. Only a matching allow passes; errors fail closed. The cached enforcer loads files at process startup, so restart CMS after a policy/model edit.

```mermaid
sequenceDiagram
  participant B as Browser
  participant W as Web UI
  participant P as Payload API
  participant A as AuthorizationAdapter
  participant C as Casbin
  B->>W: Submit sign-in
  W->>P: POST /api/users/login
  P-->>B: Auth cookie
  W->>P: GET /api/users/permissions
  P->>A: subject + action + resource + context
  A->>C: enforce(model, policy, request)
  C-->>A: allow or deny
  A-->>P: boolean (errors deny)
  P-->>W: Permission map
  Note over W,P: UI guides navigation; Payload enforces security
```

Frontend permissions only guide navigation/controls. Collection access, field access, workflow handlers, and feature endpoints enforce access server-side. Hiding a button is not security. `CASL` is not used.

## Subscriptions and entitlements

`apps/cms/src/subscriptions/seedData.ts` defines these demonstration plans:

| Plan | Price/month | Included widgets |
| --- | ---: | --- |
| Basic | USD 9.99 | Market Overview |
| Premium | USD 29.99 | Market Overview, Stock Watchlist |
| Enterprise | USD 99.99 | All five |

| Widget | Feature code | Demo price/month, year |
| --- | --- | ---: |
| Market Overview | `market-overview` | USD 3.99, 39.99 |
| Stock Watchlist | `watchlist` | USD 4.99, 49.99 |
| Stock Charts | `basic-charts` | USD 7.99, 79.99 |
| Market News | `market-news` | USD 3.99, 39.99 |
| Portfolio Summary | `portfolio-analytics` | USD 8.99, 89.99 |

Prices are demonstration values, not production offers. The seed script reconciles by feature/plan code and makes obsolete mappings inactive rather than deleting records.

`EntitlementService.canAccessFeature(userId, featureCode)` is the server-side decision. `PayloadEntitlementRepository` reads user, feature, main subscription, plan-feature mappings, and individual widget subscriptions. It denies by default and checks:

1. User exists and account status is active.
2. Feature exists and is active.
3. Casbin permits `use_feature`.
4. Active `admin`/`super_admin` can inspect active features for support/QA after the Casbin check.
5. A `subscriber`/`trader` has either an active date-valid main plan containing the feature or an individual widget subscription whose paid period covers now.

Cancelled individual subscriptions retain access only until `currentPeriodEnd`. The server derives purchase price, user, status, and dates; rejects duplicate active/paid-through purchases and features already included in the main plan. Billing is simulated; no card data is collected.

```mermaid
flowchart TD
  Start[Request feature] --> User{User exists and active?}
  User -- no --> Deny[Deny]
  User -- yes --> Feature{Feature exists and active?}
  Feature -- no --> Deny
  Feature -- yes --> Policy{Casbin allows use_feature?}
  Policy -- no --> Deny
  Policy -- yes --> Staff{Active admin or super_admin?}
  Staff -- yes --> Allow[Allow]
  Staff -- no --> Main{Valid main plan includes feature?}
  Main -- yes --> Allow
  Main -- no --> Widget{Individual sub paid-through now?}
  Widget -- yes --> Allow
  Widget -- no --> Deny
```

## Editorial workflow

Pages and News use Payload drafts/versions plus `workflowStatus`. Transitions live in `apps/cms/src/editorial/workflow.ts`:

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InReview: Author submits
  InReview --> ChangesRequested: Editor requests changes
  ChangesRequested --> InReview: Author resubmits
  InReview --> Approved: Approver approves
  Approved --> Published: Admin publishes
```

Transition handlers validate state, authorize, reject self-approval, update Payload `_status`, record actor/time/note, and record publication time. Direct status edits are blocked by field access/hooks. Public Pages/News reads require both workflow and Payload status to be published; public Banners/FAQs reads require active status.

## API map

Payload's generated REST API is mounted at `/api`; GraphQL POST and GraphQL Playground routes also exist. The web app uses REST. Standard collections use `/api/<collection-slug>` and their access functions.

| Method/path | Purpose | Enforcement |
| --- | --- | --- |
| `POST /api/users/login`, `POST /api/users/logout`, `GET /api/users/me` | Payload auth | Payload built-in auth. |
| `GET /api/users/permissions` | UI permission map | Auth required; Casbin checks. |
| `GET /api/subscription-plans/catalog` | Active plan catalog | Public demo pricing. |
| `POST /api/subscription-plans/simulate-upgrade` | Simulated main plan change | Auth + Casbin; no payment. |
| `GET /api/user-subscriptions/me` | Current user's active plan | Auth and scoped to user. |
| `GET /api/features/entitlements/me` | User feature decisions | Auth + EntitlementService. |
| `GET /api/features/market-overview/data` | Example data | Casbin and entitlement. |
| `GET /api/features/stock-watchlist/data` | Example data | Casbin and entitlement. |
| `GET /api/user-widget-subscriptions/catalog` | Individual widget catalog | Active subscriber/trader. |
| `GET /api/user-widget-subscriptions/me` | Current user's widget subs | Active subscriber/trader. |
| `POST /api/user-widget-subscriptions/purchase` | Simulated monthly/yearly purchase | Server sets user, price, status, and dates; rejects conflicts. |
| `POST /api/user-widget-subscriptions/cancel` | Cancel an individual widget sub | Access remains through paid-through date. |
| `POST /api/pages/transition`, `POST /api/news/transition` | Editorial transitions | Server checks role and state. |

The public web slug route currently supports `/about`. Draft filtering is enforced by Payload and rechecked by its renderer.

Protected feature endpoints authenticate, authorize `use_feature`, then call `canAccessFeature`. Existing examples are in `apps/cms/src/collections/Features.ts`:

```ts
const subject = toAuthorizationSubject(req.user)
if (!subject) return Response.json({ error: 'Authentication required' }, { status: 401 })
const allowed = await authorizePayloadUser(req.user, {
  action: 'use_feature',
  resource: { type: 'features', attributes: { ownerId: null, tenantId: null } },
})
if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 })
const service = await createPayloadEntitlementService(req.payload)
if (!(await service.canAccessFeature(subject.id, 'market-overview'))) {
  return Response.json({ error: 'Feature entitlement required' }, { status: 403 })
}
```

Never treat UI visibility as a security check. Use Payload `overrideAccess: true` for a user request only after the handler has authenticated, authorized, scoped, and validated it.

## Local installation

### Prerequisites

- Node.js 24.22.3 (manifest engines allow `^22.23.5 || ^24.22.3 || >=26.13.1`).
- Corepack/pnpm 10.23.0; manifests allow pnpm 9, 10, or 11.
- Docker Engine/Compose (verified 29.5.2/5.1.4), Git, and free ports 5433, 3000, 5173.

There is no root pnpm workspace. Install dependencies separately in each app.

### 1. Configure local environment files

From the repository root:

```sh
cd apps/cms
cp .env.example .env
```

Create ignored `apps/cms/.postgres.env`:

```dotenv
POSTGRES_DB=alphaprotrade
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-a-unique-local-password
```

Set matching values in `apps/cms/.env`:

```dotenv
DATABASE_URL=postgres://postgres:replace-with-a-unique-local-password@127.0.0.1:5433/alphaprotrade
PAYLOAD_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_WEB_URL=http://localhost:5173
```

Use real local secrets instead of placeholders. Do not commit `.env`, `.postgres.env`, bootstrap tokens, or demo credentials. These CMS files are ignored by `apps/cms/.gitignore`. Web defaults to `PAYLOAD_URL=http://localhost:3000`; set it in `apps/web/.env.local` (from `.env.example`) if CMS runs elsewhere.

### 2. Check port and start PostgreSQL

Check that port 5433 and the dedicated container name are available; do not stop an unknown process/container:

```sh
lsof -nP -iTCP:5433 -sTCP:LISTEN
docker ps -a --filter name=alphaprotrade-postgres
```

From `apps/cms`, start only the database:

```sh
docker compose -f docker-compose.postgres.yml up -d db
docker compose -f docker-compose.postgres.yml ps
docker compose -f docker-compose.postgres.yml logs -f db
```

Wait for its health check. Compose creates `alphaprotrade-net`, maps loopback host port 5433 to container 5432, and stores database files in named volume `alphaprotrade-pgdata`.

### 3. Install and migrate

From `apps/cms`:

```sh
corepack pnpm@10.23.0 install
pnpm payload migrate:status
pnpm payload migrate
```

Current migrations: `20261124_194358` and `20261125_071631_add_individual_widget_subscriptions`. A fresh database must run them; `migrate:status` is authoritative. `src/payload.config.ts` sets `push: false`. If Payload warns that a development-mode schema push could cause data loss, stop and inspect target DB, migration status, and schema before confirming.

### 4. Seed plans and features

```sh
pnpm seed:subscriptions
```

Run from `apps/cms`. This reconciles the five widgets, three plans, and mappings; obsolete records are marked inactive, not deleted. Run seeds only against the POC database.

### 5. Create the first super administrator

There is no public super-admin endpoint. The CLI requires a configured SHA-256 hash, an owner-only secret token file, an interactive terminal, `--confirm`, and bootstrap email/password values in the ignored `.env`. It refuses to run if a super-admin already exists.

Generate the token file without printing its contents; set the printed hash in `.env` as `ALPHAPROTRADE_BOOTSTRAP_SECRET_SHA256`, and set `BOOTSTRAP_ADMIN_EMAIL` plus a unique password at least 16 characters long. Hash without a newline:

```sh
umask 077
BOOTSTRAP_TOKEN_FILE="$(mktemp /tmp/alphaprotrade-bootstrap.XXXXXX)"
openssl rand -hex 32 > "$BOOTSTRAP_TOKEN_FILE"
chmod 600 "$BOOTSTRAP_TOKEN_FILE"
tr -d '\n' < "$BOOTSTRAP_TOKEN_FILE" | shasum -a 256
```

From `apps/cms`, run in an interactive terminal:

```sh
pnpm bootstrap:super-admin -- --secret-file "$BOOTSTRAP_TOKEN_FILE" --confirm
rm -f "$BOOTSTRAP_TOKEN_FILE"
unset BOOTSTRAP_TOKEN_FILE
```

After success, remove/blank the bootstrap hash, email, and password in `.env`. The script logs the email, not password. Never put secrets in documentation, command output, or commits.

### 6. Optional demo accounts

After seeding plans and bootstrapping admin, run from `apps/cms`:

```sh
pnpm prepare:demo -- --credentials-file .demo-credentials
```

It writes generated passwords into ignored owner-only `apps/cms/.demo-credentials`. Accounts: `subscriber@alphaprotrade.local` (Basic), `trader@alphaprotrade.local` (Premium), `enterprise.demo@alphaprotrade.local` (Enterprise). The script refuses duplicates, keeps super-admin admin-only, and aligns existing demo subscriptions. Never commit/print the credentials file.

### 7. Start CMS and web

Use two terminals from the repository root:

```sh
cd apps/cms
pnpm dev
```

```sh
cd apps/web
corepack pnpm@10.23.0 install
pnpm dev
```

Open `http://localhost:5173`, `http://localhost:3000/admin`, or the published About page at `http://localhost:5173/about`.

### Logs, shutdown, and data persistence

- Stop each Next process with `Ctrl+C` in its terminal.
- DB logs: `docker compose -f docker-compose.postgres.yml logs -f db` from `apps/cms`.
- Stop only the AlphaProTrade database: `docker compose -f docker-compose.postgres.yml stop db`.
- Start it again with `docker compose -f docker-compose.postgres.yml up -d db`.
- Named volume `alphaprotrade-pgdata` persists across stops. Never use `down -v`, volume deletion, or Docker prune commands for this POC.

Compose does not build or run CMS/web; it is not an all-in-one container deployment.

```mermaid
flowchart LR
  Compose[Docker Compose project]
  DB[db service<br/>PostgreSQL 16]
  Net[alphaprotrade-net]
  Vol[(alphaprotrade-pgdata)]
  Host[Host applications<br/>CMS :3000 and web :5173]
  Compose --> DB
  DB --- Net
  DB --- Vol
  Host -->|127.0.0.1:5433 to container :5432| DB
```

## Migrations and seed data

Migrations under `apps/cms/src/migrations/`:

1. `20261124_194358` — base collections and relationships.
2. `20261125_071631_add_individual_widget_subscriptions` — individual widget subscription tables/relations and feature prices.

To change schema, edit a Payload collection, then from `apps/cms`:

```sh
pnpm generate:types
pnpm payload migrate:create
```

Review generated `.ts` and `.json`, verify with `pnpm payload migrate:status`, and apply with `pnpm payload migrate` only after confirming database identity and SQL. Never run `migrate:reset`, `migrate:fresh`, `migrate:refresh`, or delete a volume containing needed data. A migration `down` can be destructive even if `up` is additive.

The connected local database `alphaprotrade` has both migrations applied. `seed:subscriptions` changes demo records/mappings, not schema.

## Common development tasks

### Add a Payload collection

1. Add `apps/cms/src/collections/YourCollection.ts` following existing `CollectionConfig` patterns.
2. Define explicit access; use `authorizePayloadUser` or `createAdminOnlyAccess` for protected resources.
3. Register it in `apps/cms/src/payload.config.ts`.
4. Generate types, create/review a migration, and add tests under `apps/cms/tests/int/`.
5. Regenerate the Payload Admin import map only if custom Admin components require it.

### Add an API endpoint

Endpoint declarations live in the owning collection's `endpoints` array (`path`, `method`, `handler`). Authenticate, validate, check Casbin, check entitlement for paid data, then return JSON. Payload's generated handler is `apps/cms/src/app/(payload)/api/[...slug]/route.ts`; web requests are declared in `apps/web/src/lib/api.ts`.

```ts
{
  path: '/market-overview/data',
  method: 'get',
  handler: async (req) => {
    // Resolve req.user; authorize use_feature; call EntitlementService.
  },
}
```

### Add a Casbin permission

Add a role/resource/action/scope rule to `apps/cms/src/authz/policy.csv`, add the server-side Payload check, and write allow/deny tests. Existing CSV form, for example:

```csv
p, trader, features, use_feature, all, allow
```

Restart CMS after policy/model edits because the enforcer caches those files. Never grant permission from frontend code.

### Add a feature/widget or change entitlements

1. Add a stable code and metadata to `FEATURE_SEEDS` in `apps/cms/src/subscriptions/seedData.ts`.
2. Add the code to intended `PLAN_SEEDS[].featureCodes` mappings; set demo prices if individually purchasable.
3. Run `pnpm seed:subscriptions` against local POC DB and inspect results.
4. Add UI metadata in `apps/web/src/lib/demo.ts`, render it in `apps/web/src/App.tsx`, and add a protected server API if needed.
5. Keep decision logic in `EntitlementService.ts`, data access in `PayloadEntitlementRepository.ts`, and period rules in `widgetBilling.ts`; update tests.

Current mapping counts are Basic 1/5, Premium 2/5, Enterprise 5/5. Seeding deactivates obsolete records instead of deleting them.

### Add or run tests

CMS Vitest tests are under `apps/cms/tests/int/`; CMS browser tests use Playwright under `apps/cms/tests/e2e/`. Web has session/locking tests in `apps/web/src/lib/session.test.ts`.

```sh
# CMS: PostgreSQL and .env must be configured
cd apps/cms
pnpm run test:int
pnpm run test:e2e
pnpm exec tsc --noEmit
pnpm build
pnpm exec playwright install chromium  # once, if needed

# Web
cd ../web
pnpm test
pnpm typecheck
pnpm build
```

CMS `pnpm test` runs integration then end-to-end tests. Web tests do not currently exercise a real browser login or payment provider.

## Troubleshooting

| Symptom | Safe checks |
| --- | --- |
| `EADDRINUSE` on 5433 | Check `lsof -nP -iTCP:5433 -sTCP:LISTEN` and Docker containers. Do not stop unknown services. If changing the host port, change Compose mapping and `DATABASE_URL` together. |
| PostgreSQL unhealthy / Payload cannot connect | Check `.postgres.env`, `DATABASE_URL`, health, and `docker compose ... logs db`. Passwords must match. Do not delete the named volume to reset credentials. |
| Migration warns about data loss | Stop; inspect DB identity, status, schema, and SQL. Do not confirm blindly or run reset/fresh against data. |
| Catalog endpoint returns 500 | Check CMS logs, DB, migration status, and feature price fields. Use `pnpm payload migrate:status`; do not weaken access checks. |
| 401 | Request is anonymous or Payload cookie missing/expired. Check CMS and `credentials: 'include'`. |
| 403 or widget locked | Often expected. Check active account, Casbin policy, subscription dates/status, plan-feature mapping, feature status, and individual paid-through period. Backend is authoritative. |
| Web cannot load API | Confirm CMS on port 3000, correct `PAYLOAD_URL`, web on 5173, and healthy Postgres. |
| Demo credentials unavailable | Run the preparation script after plans/admin are ready. Read only the ignored owner-only file; never paste passwords into source/docs. |
| Duplicate migration objects | Do not rerun blindly. Inspect migration status and schema for prior push/partial migration. |

## Implemented and future work

| Area | Current status |
| --- | --- |
| CMS/API | Payload 3.94.1, Postgres adapter, REST/GraphQL routes, Admin, and migrations are implemented. |
| Web | Checked-out source is Next.js 16.4.6 App Router, React 19.2.9, Tailwind 4.3.5. This is source status, not a claim that a planned production rollout is complete. |
| TailAdmin | Full template/component tree is not present; the MIT license file alone does not indicate full adoption. |
| shadcn/ui | Library not installed; local compatible Button/configuration exist. |
| Authorization | Node-Casbin behind `AuthorizationAdapter`; CASL is not used. |
| Entitlements | Main plan and individual widget checks are server-side. |
| Payments | Simulated. No processor, card storage, invoicing, or real recurring billing. |
| Market | Demo fixtures only; no live feeds, brokerage, order routing, or trade execution. |
| Docker | Compose runs PostgreSQL only; CMS and web are host Node processes. |
| AWS/CI/CD | Not configured or implemented in this repository. |
| Editorial | Author/editor/approver/admin/super-admin rules exist; a separate publisher role is future work if required. |

Treat this POC as a local demonstration. Subscription prices and market values are simulated; backend checks remain required even when the UI hides a feature.
