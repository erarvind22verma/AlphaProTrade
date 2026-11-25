# Subscription and entitlement architecture

## Data relationships

- A User can have multiple UserSubscriptions. Each subscription links one User to one SubscriptionPlan and stores status, start/end dates, and optional upgrade history.
- A SubscriptionPlan exposes its related FeatureEntitlements through a virtual Payload join field named features. The join is not a second copy of the feature list.
- Each FeatureEntitlement links one SubscriptionPlan to one Feature and has an active/inactive status.
- Features are the catalog of available trading widgets. A feature must itself be active before any plan can grant it.

The subscription and entitlement collections are manageable in Payload Admin by active admin and super_admin users only. Node-Casbin policies authorize those collection actions.

## Demonstration plan data

The idempotent seed command updates the existing five active feature records, three plans, and their mappings. Retired feature records and mappings are marked inactive rather than deleted:

| Plan | Demonstration price | Included widgets |
|---|---:|---|
| Basic | USD 9.99/month | Market Overview |
| Premium | USD 29.99/month | Market Overview, Stock Watchlist |
| Enterprise | USD 99.99/month | Market Overview, Stock Watchlist, Stock Charts, Market News, Portfolio Summary |

These are demonstration values for the POC only. There is no payment processing, card data, invoicing, or automatic renewal.

Run the seed command only after a dedicated PostgreSQL database is reachable through DATABASE_URL. The command upserts features/plans by code and reuses existing plan-feature mappings.

The `prepare:demo` command reuses the existing subscriber and trader records and creates the unique Enterprise demo user only if it is missing. It reconciles one active subscription per demo account without deleting subscription history. Any newly generated password is written only to the ignored, owner-only `apps/cms/.demo-credentials` file; existing passwords are never rotated.

## One-time super-admin bootstrap

The bootstrap is a local CLI script only; no public endpoint or admin-registration route is created. It requires an interactive terminal, an explicit confirmation flag, a protected token file with owner-only permissions, a matching SHA-256 token hash in the operator environment, admin email/password values from a secure source, and no existing super_admin record.

1. Generate a random token and save it in a temporary file with mode 0600.
2. Store only its SHA-256 hash as ALPHAPROTRADE_BOOTSTRAP_SECRET_SHA256 in the operator's temporary environment.
3. Provide BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters through a secret manager or protected environment.
4. From apps/cms, run pnpm bootstrap:super-admin -- --confirm --secret-file /path/to/token-file in an interactive terminal.
5. The script checks for any existing super_admin before creating one. Its trusted Local API write explicitly overrides access control because this is the first-account bootstrap.
6. Immediately unset the temporary environment values, invalidate the hash, and delete the token file. The script also refuses to run again once a super_admin exists.

Do not put the token or password in command-line arguments or commit them to a file. The only local user authentication system remains Payload's existing Users collection.

## Entitlement decision flow

EntitlementService.canAccessFeature(userId, featureCode) denies by default and checks, in order:

1. A user exists and has accountStatus active. Suspended and pending accounts are denied.
2. The feature exists and has status active.
3. The existing AuthorizationAdapter authorizes the user's role for the use_feature action on that feature. The Phase 1 Casbin adapter remains in use.
4. Active admins and super_admins may inspect active features for support/QA. Active subscribers and traders must have an active subscription whose start date has arrived, whose end date has not arrived, and whose plan is active.
5. At least one active FeatureEntitlement must map that plan to that feature.

Expired/cancelled/pending/suspended subscriptions do not grant paid features. A missing user, unknown role, missing plan, inactive mapping, policy/repository error, or unknown feature returns false.

## API enforcement

The demo endpoints are GET /api/features/market-overview/data and GET /api/features/stock-watchlist/data. They derive the user from Payload's authenticated request, check the existing Casbin authorization for use_feature, then call EntitlementService. The responses contain simulated values only. A Basic subscriber receives 403 from the Stock Watchlist endpoint.

The PayloadEntitlementRepository is server-only and uses Local API reads with overrideAccess enabled so the service can inspect the authoritative subscription records. Do not expose repository methods or accept a user ID from an untrusted request as the authorization principal. The endpoint always uses req.user.id.

Payload Local API operations skip collection access checks by default. Ordinary server operations must pass the authenticated user and set overrideAccess to false. The repository and seed/bootstrap scripts are trusted internal code paths that intentionally make privileged reads/writes.

## Tests and limitations

The entitlement tests use an in-memory repository and the real Casbin policy files; they do not require PostgreSQL. They cover exact Basic (1), Premium (2), and Enterprise (5) access, expired dates, suspended users, inactive and unknown features, anonymous users, bootstrap guard failures, and unauthorized plan/entitlement mutations. Live API checks should also verify locked feature endpoints against the PostgreSQL-backed application.

Not implemented: real payments, billing provider webhooks, renewals, proration, refunds, subscription cancellation automation, tax, per-user entitlement overrides, plan concurrency rules, React UI, real trading data, and database migrations. The configured PostgreSQL adapter and seed script require an available database, but no PostgreSQL/Docker service is started by Phase 2.
