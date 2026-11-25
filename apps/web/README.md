# AlphaProTrade Web

Customer-facing Next.js App Router application using TypeScript, Tailwind CSS 4, and shadcn/ui-compatible primitives. Its responsive shell and theme tokens are adapted from TailAdmin's free Next.js template. The free template's MIT notice is preserved in `TAILADMIN-MIT-LICENSE.txt`; no Pro components or assets are used.

## Requirements and startup

- Node.js 24.22.3 (or a supported version in `package.json`)
- pnpm 9, 10, or 11
- Payload CMS available at `http://localhost:3000`
- PostgreSQL configured for Payload; the web app does not connect to the database

Copy `.env.example` to `.env.local` and set `PAYLOAD_URL` if Payload runs elsewhere. Start the CMS in one terminal:

```sh
cd apps/cms
pnpm dev
```

Install and start the web app separately:

```sh
cd apps/web
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Next.js forwards `/api/*` requests to Payload through a same-origin rewrite so Payload's authentication cookie and REST API integration continue to work. Existing login, permissions, entitlement, plan upgrade, individual widget purchase/cancellation, CMS content, and public `/about` flows are retained.

Reconcile the five features, three plans, and their exact mappings by running `pnpm seed:subscriptions` from `apps/cms`. Prepare the Basic, Premium, and Enterprise demo accounts with `pnpm prepare:demo -- --credentials-file .demo-credentials`. Generated passwords remain in the ignored local credentials file.

## Preserved backend behavior

- Login/logout and current-user checks use Payload authentication.
- Casbin permission responses guide navigation; Payload access controls, Casbin, and `EntitlementService` remain the security authority.
- Plans and individual widget subscriptions use existing Payload endpoints; payment remains simulated.
- The five demo widgets remain Market Overview, Stock Watchlist, Stock Charts, Market News, and Portfolio Summary.
- CMS pages and news are requested published-only; banners and FAQs continue to use active records.
- The CMS overview remains read-only; management still happens in Payload Admin.

The interface uses simulated financial data only. It does not connect to live market feeds, execute trades, or process real payments.

## Commands

```sh
pnpm typecheck
pnpm test
pnpm build
```
