# AlphaProTrade — Developer Setup Guide

This guide explains the technologies used by AlphaProTrade and how to configure, install, run, and test the current local development environment.

> **Environment note:** This guide reflects the supplied project README and its stated environment as of 26 November 2026. The documented setup runs PostgreSQL in Docker while the CMS and web applications run as local Node.js processes. It is not a three-container application setup.

## 1. Project overview

AlphaProTrade is maintained in one Git repository containing two applications:

- **`apps/cms`** — Payload CMS, its Admin UI, APIs, database configuration, and server-side application code.
- **`apps/web`** — the customer-facing web application.

PostgreSQL stores application data. The browser communicates with the web application and Payload APIs; it does not connect directly to the database.

## 2. Technology stack

Versions below are those recorded in the supplied project README. Check the app manifests and lock files if the project has changed since that snapshot.

| Technology | Recorded version | Purpose |
|---|---:|---|
| Node.js | 24.22.3 | Runtime for both applications, scripts, and tests |
| pnpm (via Corepack) | 10.23.0 | Installs dependencies separately in each application |
| React | 19.2.9 | User interface library |
| Next.js | 16.4.6 | Application framework for CMS and web |
| Payload CMS | 3.94.1 | CMS, Admin UI, APIs, collections, and migrations |
| Payload PostgreSQL adapter | 3.94.1 | Connects Payload to PostgreSQL |
| PostgreSQL | 16.16 locally; Compose uses `postgres:16-alpine` pinned by digest | Relational database |
| Node-Casbin | 5.51.1 | Authorization policy engine |
| TypeScript | 5.7.3 | Static type checking |
| Tailwind CSS | 4.3.5 | Utility-first styling |
| Vitest | 4.0.18 | Test runner |
| Playwright | 1.63.0 | Browser testing |
| Docker Engine / Compose | 29.5.2 / 5.1.4 | Runs the PostgreSQL service |

The repository has separate package manifests and lock files for `apps/cms` and `apps/web`. There is no root pnpm workspace or root package script.

## 3. High-level architecture

```mermaid
flowchart LR
  Browser[Browser]
  Web[Web application<br/>Next.js + React<br/>localhost:5173]
  CMS[Payload CMS + Admin<br/>Next.js<br/>localhost:3000]
  DB[(PostgreSQL<br/>container port 5432)]
  Volume[(Persistent Docker volume)]

  Browser -->|Web UI| Web
  Browser -->|CMS Admin| CMS
  Web -->|/api requests via configured rewrite| CMS
  CMS -->|DATABASE_URL| DB
  DB --> Volume
```

- The web application communicates with Payload through its configured `/api/*` rewrite and `PAYLOAD_URL`.
- Payload handles server-side API operations and database access.
- PostgreSQL is exposed to the host at `127.0.0.1:5433` and listens inside its container on port `5432`.
- The browser does not connect directly to PostgreSQL.

## 4. Repository structure

```text
alphaprotrade-poc/
├── README.md
└── apps/
    ├── cms/
    │   ├── docker-compose.postgres.yml
    │   ├── package.json
    │   ├── pnpm-lock.yaml
    │   ├── scripts/
    │   ├── src/
    │   │   ├── app/
    │   │   ├── collections/
    │   │   ├── migrations/
    │   │   └── payload.config.ts
    │   └── tests/
    └── web/
        ├── package.json
        ├── pnpm-lock.yaml
        └── src/
            ├── app/
            ├── components/
            ├── lib/
            ├── App.tsx
            └── styles.css
```

- `apps/cms/src/collections/` — Payload collection definitions.
- `apps/cms/src/migrations/` — database migrations.
- `apps/cms/scripts/` — setup, bootstrap, and seed scripts.
- `apps/web/src/app/` — web routes and global styles.
- `apps/web/src/components/` — reusable UI components.
- `apps/web/src/lib/` — API client and session utilities.

## 5. Prerequisites

Install the following on your development machine:

- Git
- Node.js `24.22.3` (the supplied README records supported manifest engines as `^22.23.5 || ^24.22.3 || >=26.13.1`)
- Corepack and pnpm `10.23.0` (the manifests allow pnpm 9, 10, or 11)
- Docker Engine and Docker Compose

The documented local setup uses these ports:

| Service | Local address |
|---|---|
| Web application | `http://localhost:5173` |
| Payload CMS Admin | `http://localhost:3000/admin` |
| Payload API | `http://localhost:3000/api` |
| PostgreSQL | `127.0.0.1:5433` |

Make sure these ports are available before starting the applications.

## 6. Clone the repository

```bash
git clone <repository-url>
cd alphaprotrade-poc
```

Use the repository URL provided by the project owner.

## 7. Configure environment variables

The supplied project README documents CMS environment configuration and a separate PostgreSQL environment file.

From the repository root:

```bash
cd apps/cms
cp .env.example .env
```

Create `apps/cms/.postgres.env` with local database credentials:

```dotenv
POSTGRES_DB=alphaprotrade
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-a-unique-local-password
```

Set the matching values in `apps/cms/.env`:

```dotenv
DATABASE_URL=postgres://postgres:replace-with-a-unique-local-password@127.0.0.1:5433/alphaprotrade
PAYLOAD_SECRET=replace-with-a-long-random-secret
NEXT_PUBLIC_WEB_URL=http://localhost:5173
```

Use the same database username and password in both files. Replace all example secrets with unique local values.

The web application uses `PAYLOAD_URL=http://localhost:3000` by default. If the CMS runs at another address, configure it in `apps/web/.env.local` using the web app's `.env.example` as a reference.

**Never commit environment files, passwords, API tokens, bootstrap secrets, or generated demo credentials.**

## 8. Start PostgreSQL

The current Compose file runs PostgreSQL only. It does not build or start the CMS or web application.

Before starting, check whether the port or container name is already in use:

```bash
lsof -nP -iTCP:5433 -sTCP:LISTEN
docker ps -a --filter name=alphaprotrade-postgres
```

Do not stop or remove an existing process/container unless you have confirmed it belongs to this project and it is safe to do so.

From `apps/cms`, start the database:

```bash
docker compose -f docker-compose.postgres.yml up -d db
docker compose -f docker-compose.postgres.yml ps
docker compose -f docker-compose.postgres.yml logs -f db
```

Wait until the PostgreSQL health check reports healthy.

The Compose setup uses a dedicated Docker network and the named volume `alphaprotrade-pgdata` for persistent database storage.

## 9. Install dependencies

Install CMS dependencies:

```bash
cd apps/cms
corepack pnpm@10.23.0 install
```

Install web dependencies in a second terminal:

```bash
cd apps/web
corepack pnpm@10.23.0 install
```

Dependencies are installed separately because the repository does not define a root pnpm workspace.

## 10. Run database migrations and seed data

From `apps/cms`, check and apply migrations:

```bash
pnpm payload migrate:status
pnpm payload migrate
```

The supplied README records these migrations:

- `20261124_194358` — base collections and relationships.
- `20261125_071631_add_individual_widget_subscriptions` — individual widget subscription tables, relationships, and feature prices.

The migration status command is the source of truth for the database you are using. Review migration output and confirm the target database before applying changes.

Seed the demonstration plan and feature data:

```bash
pnpm seed:subscriptions
```

Run seed scripts only against the intended local development database.

## 11. Create the initial administrator

The supplied project uses a protected CLI bootstrap script rather than a public endpoint to create the first super administrator.

The bootstrap process requires configuration in the ignored CMS `.env`, a protected token file, and an interactive terminal. Follow the current script's instructions and the security notes in the project source. Do not put bootstrap secrets or administrator passwords in this README, Git, or shared terminal logs.

After the administrator is created, remove the temporary bootstrap configuration and token file as directed by the script.

## 12. Start the applications

Start the CMS from one terminal:

```bash
cd apps/cms
pnpm dev
```

Start the web application from another terminal:

```bash
cd apps/web
pnpm dev
```

Open the applications:

- Web: [http://localhost:5173](http://localhost:5173)
- Payload Admin: [http://localhost:3000/admin](http://localhost:3000/admin)
- Payload API: [http://localhost:3000/api](http://localhost:3000/api)

## 13. Common development commands

Run commands from the relevant application directory.

### CMS (`apps/cms`)

```bash
pnpm dev
pnpm build
pnpm exec tsc --noEmit
pnpm run test:int
pnpm run test:e2e
pnpm payload migrate:status
pnpm payload migrate
```

### Web (`apps/web`)

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

For CMS browser tests, the supplied Playwright configuration starts or reuses the CMS at `http://localhost:3000`. Install the Playwright browser once if required:

```bash
pnpm exec playwright install chromium
```

## 14. Stop services and preserve data

- Stop the CMS and web development servers with `Ctrl+C` in their respective terminals.
- Follow the database logs with:

```bash
cd apps/cms
docker compose -f docker-compose.postgres.yml logs -f db
```

- Stop the PostgreSQL service:

```bash
docker compose -f docker-compose.postgres.yml stop db
```

- Start it again:

```bash
docker compose -f docker-compose.postgres.yml up -d db
```

The named Docker volume persists database data across container stops and restarts.

**Do not run `docker compose down -v`, delete the named volume, or run Docker prune commands** if you need to preserve the local database.

## 15. Troubleshooting

| Problem | Checks |
|---|---|
| Port `5433` is already in use | Check `lsof -nP -iTCP:5433 -sTCP:LISTEN` and inspect Docker containers before changing or stopping anything. |
| PostgreSQL is unhealthy | Check `apps/cms/.postgres.env`, the matching `DATABASE_URL`, container health, and database logs. |
| CMS cannot connect to PostgreSQL | Confirm PostgreSQL is running and the host port, database name, username, and password match. |
| Migration reports an error or possible data loss | Stop and inspect the database identity, migration status, and migration SQL. Do not confirm blindly or reset the database. |
| Web application cannot reach the API | Confirm CMS is running on port `3000` and `PAYLOAD_URL` is correct. |
| `401 Unauthorized` | Check whether the user is signed in and whether the Payload authentication cookie is present and valid. |
| `403 Forbidden` | The server may be denying the requested operation. Check the account and access configuration; do not bypass server-side checks to fix a UI symptom. |
| Dependencies or commands differ | Check the relevant `apps/cms/package.json` or `apps/web/package.json` and its lock file. |

## 16. Current setup limitations

- Docker Compose currently runs PostgreSQL only. CMS and web run as local Node.js processes.
- This is a local development setup, not a production deployment guide.
- Production hosting, AWS infrastructure, and CI/CD are not configured by these instructions.
- Payment processing and live market-data integrations are not configured in this local POC.

---

**Developer reminder:** Keep secrets out of Git, use migrations for database schema changes, and verify the target database before running migration or seed commands.
