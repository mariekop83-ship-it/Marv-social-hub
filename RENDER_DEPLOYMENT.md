# Render deployment checklist

- [ ] Upload this folder to a private Git repository.
- [ ] Provision persistent external MySQL and take a backup of the legacy DB.
- [ ] Test `npm run migrate` against a disposable database copy first.
- [ ] Create Render Web Service: build `npm install && npm run migrate`; start `npm start`.
- [ ] Configure `NODE_ENV=production`, `APP_BASE_URL`, `SESSION_SECRET` (32+ chars), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL=true` if required, and one-time `SETUP_ADMIN_*` bootstrap values.
- [ ] Verify `/healthz` returns `ok: true`.
- [ ] Sign in to admin, remove `SETUP_ADMIN_*` variables, and redeploy.
- [ ] Add provider keys through Admin → Website settings; never commit them.
- [ ] Run read-only provider tests and catalogue sync, then manually validate currency and NGN prices.
- [ ] Do not launch paid orders until checkout, pool selection, OTP polling, provider cancellation, ambiguous-order reconciliation and refund tests are complete.
