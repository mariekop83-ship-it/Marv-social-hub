# Mar Social Hub — feature parity and completion report

Statuses describe this updated website package compared with the actual supplied `bot-33.py`. “Implemented but not live-tested” means code exists but no real provider credentials/hosted environment were available. No paid orders were made.

| Feature | Status | Evidence / limitation |
|---|---|---|
| Responsive customer website and mobile menu | Completed; static checks passed | Existing responsive CSS/JS preserved. |
| Registration/login/password hashing | Implemented; static checks passed | Password hash, session regeneration, CSRF tokens. Browser/DB test blocked by missing local pdo_mysql. |
| Password change | Implemented; static checks passed | Requires current password and matching 10+ character replacement. |
| NGN wallet and transaction history | Partial | MySQL website ledger works independently; integer minor units migration not performed. Existing DECIMAL(14,2) retained. |
| Manual deposit request | Partial | Request + admin approval/rejection with row locking; proof upload and rejection reason field absent. |
| Marketplace and Website products | Partial | Admin product creation/toggle, line inventory, wallet debit/order/transaction and private history delivery. Edit/delete/upload/bulk import are limited. |
| Support inbox/replies | Partial | Messages/replies stored in MySQL and customer notification generated. No realtime push/polling or attachment upload. |
| In-site announcements | Partial | Admin broadcasts to the site notifications table; duplicate prevention and Telegram delivery tracking absent. |
| Floating support shortcut | Implemented; static checks passed | HTTPS URL, label, method and enabled/disabled setting. |
| Admin service display name and NGN price overrides | Implemented; static checks passed | `service_overrides` page supports create/update/toggle. Not all catalogue pages consume all override types yet. |
| Provider connection tests | Implemented but not live-tested | Balance/read calls only. No keys supplied; local runtime lacks cURL. |
| Admin audit log | Implemented; static checks passed | Sensitive settings, deposit, wallet, product, provider-test actions recorded without secrets. Not every action is logged yet. |
| Rakib Socials Social Log 1 catalogue | Implemented against source contract; not live-tested | `GET /products?page=N&in_stock=true`, `Authorization: Bearer` auth. Local runtime lacks cURL. |
| Rakib Socials Social Log 1 purchase/delivery | Implemented against source contract; not live-tested | `POST /buy` JSON `{product, quantity:1}`; request key, wallet reservation, definite-error refund, ambiguous `pending_review`, owner-only history delivery. No provider order-status endpoint exists in the bot adapter. |
| Rakib provider balance | Read-only test implemented; not live-tested | `GET /balance`; response balance is not exposed to customers. |
| Grizzly SMS number allocation | Implemented in website code; not live-tested | Uses `getNumberV2` with admin-mapped service ID and customer-selected country ID. Customer price is the configured NGN override; admin must verify provider cost/margin. |
| Grizzly OTP polling/cancel/refund | Implemented in website code; not live-tested | Number History polls `getStatusV2` while open; cancellation sends `setStatus=8` and refunds only after provider confirmation; OTP receipt sends `setStatus=6`. An authenticated `worker.php` endpoint is included; unattended polling still requires an external scheduler and permitted outbound HTTPS. |
| NovaSolution number orders | Implemented in website code; not live-tested | Uses `POST /orders` with `{type:'numbers', service_id:...}` and `Idempotency-Key`; session polling and cancel endpoints follow the supplied bot source contract. Admin maps each catalogue pool to a customer-facing NGN price. |
| Really Simple Social SMM orders | Implemented in this package; not live-tested | Uses POST form `action=add`, `service`, `link`, `quantity`. Admin must set an NGN price per 1,000 units; quantity is validated against provider limits. Definite provider rejections refund; ambiguous results remain held for review. Status can be refreshed manually from SMM History. No automatic background polling/refill/cancel. |
| NovaSolution SMM | Implemented in this package; not live-tested | Uses documented `POST /orders` shape `{type:'smm', item_id, quantity, payload:{link}}`; status can be refreshed manually with `GET /orders/{id}`. Requires an admin-set NGN unit price. The website sends the request key in the `Idempotency-Key` header; uncertain outcomes are held for review. |
| NovaSolution Social Logs | Implemented in this package; not live-tested | Uses documented `POST /orders` shape `{type:'logs', product_id, quantity}` and manual `GET /orders/{id}` refresh. Requires an admin-set NGN unit price. The website sends the request key in the `Idempotency-Key` header; uncertain outcomes are held for review. |
| Social Log 2 and SMM Boosting 2 checkout | Checkout implemented; not live-tested | NovaSolution SMM/Logs checkout and manual status refresh are wired in the website package. Automatic status polling, complete settlement/reconciliation, and provider-side idempotency are still outstanding. |
| Service/country/pool search and full pool pricing | Blocked / partial | Website has no full Grizzly pool browser/editor. The bot's multiple pools and markup rules are not synchronized. |
| OTP/SMM automated polling | Partial | Website Number History refreshes active number sessions while open, and an authenticated `worker.php` endpoint supports unattended number polling when called by an external scheduler. SMM order refresh remains manual. |
| Telegram ↔ website balances, transactions, deposits, orders, inventory | Blocked / not implemented | Bot uses SQLite; website uses MySQL. No authenticated bridge or migration has been deployed. See `BOT_SYNC.md`. |
| Live provider end-to-end tests | Blocked | No provider credentials; local PHP lacks `pdo_mysql` and `curl`; no paid purchase authorized. |
| Database health endpoint | Implemented; not live-tested | `health.php` returns only connection status, never DB credentials or schema details. |
| Schema initialization / browser flow tests | Blocked in this build environment | `php -l` passed, but local PHP has no `pdo_mysql`; actual MySQL/browser integration couldn't be executed. |

V6 note: username/email login and editable provider catalogue metadata were added. Live provider pricing/currency and per-country/pool number checkout are not yet end-to-end verified.


## v7 catalogue and purchase-flow update (2026-10-13)

Implemented in this build:
- GrizzlySMS number purchase now follows service → live country → live available pool. Pool selection submits the exact provider pool ID (when supplied) and max provider price to the allocation endpoint.
- Added `number_pool_overrides` for per-country/per-pool customer NGN price and visibility. Provider cost, pool ID and stock are shown only in admin's Service Pricing manager; customer cards show the customer price only.
- Admin can load a Grizzly service ID, choose a country returned by the provider, then edit each live pool's NGN price and visibility.
- Social Log product catalogue has a category filter before product cards; Nova/Really Simple Social catalogue pages filter by the provider's returned category/platform before listing services.
- Server-side purchase handler rejects admin-disabled pools, checks wallet balance under a row lock, records a request key and does not charge for insufficient funds.

Still partial / needs live credentials:
- NovaSolution's number page still relies on the catalogue items synced by the admin and does not yet implement the same live country → per-country pool picker as GrizzlySMS. The Nova `/catalog/numbers` response varies by country/scope, and the deployed account's exact country/pool response must be tested before enabling an unverified order mapping.
- Automatic conversion of provider costs to NGN is deliberately not guessed. Services are visible after sync, but a valid NGN customer price is required before checkout. Verify existing prices imported by older builds because they may reflect raw provider units.
- No provider API keys or deployed MySQL database were available for live test orders, OTP delivery, status polling, or refund tests. Static checks do not replace staging purchases.

V7 PRICE SAFETY NOTE: New catalogue imports no longer copy provider costs/currencies into the customer NGN price. Imported services/products remain visible but checkout is blocked until a valid admin-set customer price exists. Existing prices from earlier builds are preserved for compatibility and should be reviewed in Admin > Service Pricing before accepting live orders.


## 2026-10-13 update
- Customer-facing provider branding: partial/implemented for provider labels and imported service names; admin settings remain provider-specific as required.
- Floating support shortcut: implemented as viewport-fixed and moved out of the scrolling layout.
- Number purchase selector: Server -> Country -> Service -> Available posts implemented for Grizzly and Nova when live catalogue rows include country/service fields. Grizzly pools are revalidated live. Nova country metadata and post IDs require live-account confirmation before declaring fully verified.

- Nova number selector refinement: Server -> Country -> Service -> Available posts; uses live `/catalog/numbers` global index and country/server-specific catalogue calls, generic server labels, individual admin customer price keys, and live post revalidation at checkout. Live provider credentials are still required for runtime verification.


## v9 purchase flow refinements
- Nova number flow: server → country → service → available ports; real server IDs are preserved regardless of whether the API returns string IDs or objects.
- SMM: platform/category → service → target URL + quantity → confirmation → provider order; total is computed from the configured NGN per-1,000 rate.
- Social Log: platform/category → product → quantity → confirmation → purchase; quantity is passed to the relevant provider endpoint and stock is checked when the catalogue exposes stock.
- Supplier-name sanitizer now applies to customer-facing categories and imported names, and the dark dashboard design has been polished for clearer cards and mobile checkout.
- Verification performed locally: PHP syntax and static smoke tests only; live provider responses and actual wallet checkout require deployment credentials for end-to-end testing.


## v10 administration additions
- Provider/category scoped bulk pricing rules: percentage or fixed amount increase/decrease, or set exact price.
- Editable service fields: customer label, customer price, category/platform, min/max quantity, and customer visibility.
- Search/filter across the imported catalogue. Grizzly number pool prices are included in number bulk markup.
- Improved branded page loader with progress animation and reduced-motion support.


## v12 — Website Products (admin-managed websites)
- New admin page **Website Products** (also available as the Website section in Products & Inventory). Admin enters: name, description, image, price (NGN), customer panel link, admin panel link, activation code mode, and "how to use after purchase" instructions.
- Activation code modes: a different code per buyer (one line per code, each sold once, stock runs out), one shared code for every buyer (unlimited sales), or no code (unlimited sales).
- Products can now be edited (Edit button), not only toggled.
- After payment, the buyer sees the links (as buttons), the activation code and the instructions in My Purchases. These are copied into the order at purchase time, so later edits do not change what past buyers received.
- Links must be valid http:// or https:// addresses. Required: at least one of the two panel links.
- NOT executed or live-tested: no PHP runtime or database was available. Test: create a website with each code mode, buy it with a funded test wallet, confirm the delivery card, confirm stock behaviour, edit the product and confirm an old order is unchanged.
