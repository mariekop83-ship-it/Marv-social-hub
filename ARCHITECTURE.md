# Architecture and operations

## Current data boundaries

- Website authentication, wallet, deposits, orders, product inventory, support, notifications, provider settings and audit log live in the configured MySQL database.
- Telegram bot data lives in its existing SQLite database. The website does not read the SQLite file and does not claim that website and Telegram balances are shared.
- Provider API requests run synchronously during customer/admin page requests. No cron, queue worker, or callback endpoint is provided.

## Money and orders

- Website amounts use MySQL `DECIMAL(14,2)` and are displayed as NGN. For the next major schema version, migrate to integer kobo/minor units after exporting and validating all existing balances/transactions; this package deliberately preserves the existing schema.
- Manual deposit approval locks the deposit row and accepts only `pending` requests. The wallet is credited once in the same database transaction as the status change and ledger insert.
- Internal product purchase locks the product/inventory and user wallet in one transaction, deducts wallet, marks the inventory row sold, creates the order and transaction, then commits.
- Social Log 1 creates a wallet reservation and `pending_review` order before contacting Rakib Socials. A clear HTTP 4xx rejection refunds once. A network timeout, 5xx, or unusable response is ambiguous and must not be retried blindly. The admin must reconcile it against the supplier's records/support because the provider's documented `/buy` response returns keys once and the bot adapter has no status endpoint.

## Provider contracts read from bot-33.py

- Grizzly SMS uses GET requests with `api_key` and `action`; number allocation tries `getNumberV2` then `getNumber`, with `service`, `country`, optional `providerIds`, and `maxPrice`. OTP status uses `getStatusV2`/`getStatus`; cancellation/completion use `setStatus`.
- Really Simple Social uses POST form fields `key` and `action`; catalogue action `services`, order action `add` with `service`, `link`, `quantity`, status `status` with `order`, plus `refill`, `refill_status`, `cancel`, and `balance`.
- Rakib Socials uses `Authorization: Bearer ...`; GET `/categories`, GET `/products` with `page` and optional `in_stock`, POST `/buy` JSON `{product, quantity}`, GET `/balance`. Provider keys are returned in the purchase response.
- NovaSolution uses Bearer authentication and documented `/catalog/numbers`, `/catalog/smm`, `/catalog/logs`, POST `/orders` with `Idempotency-Key`, GET `/orders/{id}`, and POST `/numbers/sessions/{session_id}/poll` in the bot source.

## Provider configuration

Admin → Website Settings saves API keys and URLs. Empty key inputs preserve the existing key. Provider tests call balance/read endpoints only; they do not submit paid orders. API URLs are restricted to HTTPS. Do not enable customer sales just because a connection test passes; validate catalogue price currency, purchase payloads and reconciliation first.

## Shared-hosting deployment

The website uses PHP and MySQL but provider integrations require outbound HTTPS/cURL. Shared-hosting plans vary in their outbound API and scheduled-job support. Status polling, automatic expiry/refunds and bot synchronization need a working external scheduler if the host does not provide cron/background jobs. Confirm these capabilities with your hosting provider; do not try to bypass hosting restrictions.
