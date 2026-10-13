# Mar Social Hub — Node.js / Express migration build

This project is the Node.js migration foundation for Mar Social Hub. It replaces the PHP request layer with Express.js, EJS server-rendered pages, MySQL-backed sessions, a MySQL database, clean routes, admin-managed provider credentials, provider catalogue syncing, NGN pricing controls, exchange-rate settings, customer/admin accounts, support messages, announcements, wallet transaction history, and deposit review with exactly-once crediting.

## Important feature parity status

This is a **migration build, not a verified production replacement of every legacy PHP workflow yet**. It deliberately does not enable paid provider checkout in this build: the legacy site has provider-specific number allocation, pool selection, SMM/log order settlement, OTP polling, cancellation and refund logic. Those flows must be ported and staging-tested before customer purchases are enabled. The current customer catalogue page is read-only. Other legacy features that are not listed as implemented in this README must not be assumed to be ported. The PHP archive is included separately by the user and should be retained as the rollback version until migration acceptance tests pass.

## Requirements

- Node.js 20 or newer
- External persistent MySQL 5.7+/8.x or compatible MariaDB reachable from Render
- HTTPS provider endpoints and provider credentials for any live sync/test

## Local setup

1. Create a MySQL database and a dedicated database user.
2. Copy `.env.example` to `.env`; set the MySQL credentials, a 32+ character `SESSION_SECRET`, and a unique `SETUP_ADMIN_PASSWORD` of at least 12 characters.
3. Set `DB_SSL=true` if your database provider requires verified TLS.
4. Run `npm install`.
5. Run `npm run migrate`.
6. Run `npm start` and open `http://localhost:10000` (or the port you set).
7. The initial admin is created only if the `users` table is empty and all `SETUP_ADMIN_*` values are present. After you successfully sign in, remove the setup-admin environment variables and redeploy. Keep the regular database/session environment variables.
8. In Admin → Website settings, configure API URLs and keys. The app stores keys in the MySQL settings table; restrict DB access. For stronger secret management, replace this with a dedicated secret manager before production.
9. Run provider balance/read tests and catalogue sync. Review the source currency and every customer NGN price. A successful connection test is not proof that a purchase or refund works.

## Render deployment

1. Create a **Web Service** from this project repository (or upload the project to a Git repository first).
2. Runtime: Node. Build command: `npm install && npm run migrate`. Start command: `npm start`.
3. Create an external persistent MySQL database. Render's built-in managed PostgreSQL is not MySQL-compatible; use an external MySQL provider with Render network access, TLS settings and backups. Never use an ephemeral filesystem as the database.
4. Add the environment variables from `.env.example` to Render. Set `NODE_ENV=production`, `APP_BASE_URL`, `SESSION_SECRET`, and DB connection values. Use TLS settings specified by the MySQL provider.
5. Do not commit `.env` or real API keys. Keep database ingress restricted to the Render service where possible.
6. Open `/healthz` after deploy. It should return HTTP 200 with `ok: true` and `database: connected`.
7. Create a database backup before any schema change. Keep the PHP website and a pre-migration DB backup available for rollback until all tests pass.

## Clean routes

`/`, `/register`, `/login`, `/dashboard`, `/buy`, `/services`, `/smm`, `/orders`, `/fund`, `/transactions`, `/profile`, `/support`, `/alerts`, `/admin`, `/admin/settings`, `/admin/services`, `/admin/users`, `/admin/deposits`, `/admin/orders`, `/admin/messages`, `/admin/audit`, `/healthz`.

## Current tests and limits

- `npm run check`: JavaScript syntax checks for the application, provider module and migration script.
- Static review: provider URLs, admin role checks, password hashing, CSRF tokens, login rate limiting, database sessions, transaction locking for deposit approval, provider request timeouts, and HTTPS validation on saved provider URLs.
- Not tested here: npm dependency installation, connection to your actual MySQL service, Render deployment, admin bootstrap on a real DB, browser/mobile interaction, actual provider credentials, live catalogue response shapes, paid orders, number pool selection, OTP polling, provider cancellation, settlement reconciliation, and exactly-once refunds for all providers.

## Existing database

`schema.sql` preserves the principal legacy MySQL tables. `npm run migrate` creates missing tables and applies additive compatibility columns; it does not delete existing rows. Before using it against a production database, take a full backup and test against a copy first. Do not point the migration build at the live database until the schema has been reviewed.

## Providers

- GrizzlySMS: GET API-key/action pattern; catalogue action `getServicesList` and balance/read tests.
- NovaSolution: Bearer authentication; `/catalog/numbers`, `/catalog/smm`, `/catalog/logs`, and balance/read tests.
- Really Simple Social: form-encoded `key` / `action` pattern and `services` catalogue.
- Rakib Socials: Bearer authentication; paginated `/products` catalogue and `/balance` read.

The provider module uses request timeouts and distinguishes ambiguous provider failures. It does not automatically retry purchases. The migration build currently does not expose a paid checkout endpoint.

## Security notes

- Use a unique 32+ character session secret.
- Use TLS for production and a TLS-protected external database.
- Do not log API keys, passwords, provider payloads containing private delivery data, or OTP codes.
- API keys are currently stored in the `settings` table; encrypt-at-rest/secret-manager support is a production hardening item.
- Never enable live sales until provider purchase, polling, cancellation, and refund flows have been implemented and verified with low-value staging transactions.
