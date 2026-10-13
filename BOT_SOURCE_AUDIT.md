# Audit of the supplied `bot-33.py`

This is the current source audit used to update the website. The Python file itself is not changed by this website package.

## Provider clients confirmed in source

- **Grizzly SMS** (`class GrizzlySMS`, around line 3053): HTTP GET API with `api_key` and `action`; tries `getServicesList` then `getServices`; country list via `getCountries`; prices via `getPrices` / `getPricesV3`; number allocation via `getNumberV2` / `getNumber`; status via `getStatusV2` / `getStatus`; cancel via `setStatus` with status 8; complete via `setStatus` with status 6; balance via `getBalance`. Optional pool allocation uses `providerIds` and `maxPrice`. Bot config defaults to `https://api.grizzlysms.com/stubs/handler_api.php`.
- **Really Simple Social** (`class ReallySimpleSocialProvider`, around line 3456): POST form API default `https://reallysimplesocial.com/api/v2`; `services`, `add`, `status`, `refill`, `refill_status`, `cancel`, `balance`. `add` requires `service`, `link`, `quantity`. Status normalization maps pending/processing/completed/partial/cancelled/failed. Bot supports polling and waits for confirmed cancelled state before refunding.
- **Rakib Socials** (`class RakibSocialsProvider`, around line 3677): Bearer auth, default `https://rakibsocials.com/api/v1`; GET `/categories`, GET `/products`, POST `/buy` JSON `{product, quantity}`, GET `/balance`. Product keys arrive in the `/buy` response and are returned once. Bot source explicitly treats timeout/malformed purchase outcomes as ambiguous and does not claim a provider status endpoint.
- **NovaSolution** (`class NovaSolutionProvider`, around line 8265): Bearer auth, default `https://www.novasolution.ng/api/v1`; catalogues `/catalog/numbers`, `/catalog/smm`, `/catalog/logs`; POST `/orders` with `Idempotency-Key`; order status GET `/orders/{provider_order_id}`; number session poll POST `/numbers/sessions/{session_id}/poll`. Source uses payloads `{type:'numbers', service_id}`, `{type:'smm', item_id, quantity, payload:{link}}`, and `{type:'logs', product_id, quantity}`. It distinguishes ambiguous transport errors, retries with the same idempotency key, and records order state before contacting the provider.

## Bot database tables found in source

- `users`: account identities and wallet balances.
- `transactions`: financial ledger; code also creates `ledger_seals` to seal ledger rows.
- `payment_requests`: manual deposit requests and decisions.
- `number_orders`: Grizzly number activations, phone numbers, provider costs, customer prices, OTP/cancel/status metadata.
- `settings`: admin-configurable provider, pricing, support, payment, and feature settings.
- `pool_pricing`: custom per-service/country/pool price and markup-exempt flags.
- `audit_logs`: admin and security audit records.
- `alerts`: user alerts/announcements.
- `sl_services`, `sl_orders`: Social Logs catalogue and orders.
- `smm_services`, `smm_orders`: SMM catalogue and orders.
- `order_events`: order state events.
- `nova_items`, `nova_orders`: NovaSolution catalogue and order state/results.
- `mk_products`, `mk_inventory`, `mk_orders`: Marketplace products, individual stock items and orders.
- `wb_sites`, `wb_orders`: Website products and orders.
- Additional later-created tables: `referrals`, `referral_earnings`, `giveaways`, `giveaway_items`, `giveaway_claims`, `receipts`.

## Bot configuration variables found

`BOT_TOKEN`, `ADMIN_IDS`, `MARKET_MANAGER_IDS`, `DATABASE_PATH`, `CURRENCY` (defaults to NGN), `GRIZZLY_API_KEY`, `GRIZZLY_BASE_URL`, `SUPPORT_URL`, `PAYMENT_INSTRUCTIONS`, `SOCIAL_LOGS_API_KEY`, `SOCIAL_LOGS_API_URL`, `SMM_API_KEY`, `SMM_API_URL`, `NOVASOLUTION_API_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `SMM_POLL_SECONDS`, `SL_POLL_SECONDS`, `OTP_POLL_SECONDS`, `USD_NGN_RATE`, `FIXED_MARKUP`, `BACKUP_DIR`, and additional pricing/feature settings in the settings table.

## Telegram callback and interaction structure

The source registers `/start`, `/menu`, `/admin`, `/market`, `/security`, `/servicename`, `/servicenames`, a single `CallbackQueryHandler(callback_router)`, and a private-message `MessageHandler(message_router)`. The bot uses inline keyboards, pagination, search, admin forms, order history/status views, confirmation flows, and background polling/ticker routines. This website port does not yet reproduce all of those callback flows.

## Website parity implication

The bot contains separate operational lifecycles and data tables for all four external providers plus internal Marketplace/Website inventory. The website currently only executes Rakib Socials Social Log 1 purchases. All other external service pages remain preview-only, and no shared source of truth exists between the bot's SQLite database and the website's MySQL database.
