# Migration status (read before deploying)

## Rebuilt in Node.js
- Express.js app and EJS templates, clean URL routing and health endpoint.
- MySQL connection pool and MySQL-backed session store.
- Customer registration/login with bcrypt password hashing, session regeneration, login rate limiting, and CSRF checks for form mutations.
- One-time first-admin bootstrap from environment variables when the database has no users.
- Admin-managed API URLs and API keys for GrizzlySMS, NovaSolution, Really Simple Social, and Rakib Socials; HTTPS validation for saved URLs.
- Read-only provider balance tests and catalogue sync for provider service lists.
- Customer catalogue pages for numbers, SMM, and social logs; admin price editing, service enable/disable, and USD→NGN exchange-rate setting.
- Wallet/deposit request history and pending deposit approval/rejection. Approval uses a row lock and transaction so the same pending deposit cannot be credited twice.
- Orders and wallet transaction history views; support inbox/replies; announcements; users/status controls; admin audit log.
- Render health endpoint `/healthz` and external persistent MySQL deployment documentation.

## Not yet ported or verified; do not claim production parity
- Provider paid checkout and order state machines (SMM order placement/status refresh, Nova orders, Rakib Socials purchase and private delivery).
- GrizzlySMS/Nova country → pool selection, number allocation, one-second OTP polling, cancel/expiry and confirmed-cancellation refund.
- Product inventory / website marketplace purchasing and secure delivery.
- Receipt uploads, Telegram payment notifications, WhatsApp payment summary workflow.
- Automated background worker/cron tasks, notifications read/unread behavior, full customer/admin page parity, password reset/profile editing, and all legacy admin controls.
- Provider credentials, catalogue response compatibility, database migration on an actual host, deployment and live end-to-end tests.

Paid checkout is intentionally not exposed in this build because an unverified order/refund port could charge a customer's wallet incorrectly or cause duplicate provider purchases. Keep the existing PHP website and its database backup as rollback until these flows are ported and tested.
