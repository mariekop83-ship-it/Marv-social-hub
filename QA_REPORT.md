# Local QA report — v9

- PHP syntax checks: `index.php`, `health.php`, `config.example.php`, and `worker.php` passed.
- Static smoke checks: all checks passed.
- ZIP integrity: checked after packaging.
- Not performed: live API checkout, live OTP, provider stock race, live wallet debit/refund, and real MySQL deployment checks. These require the site's API credentials and hosted database. Do not treat static checks as proof that live providers are responding.

Additional v10 checks: PHP syntax passes; static project tests pass. Added bulk markup action and form; live DB/provider API checkout was not testable in this offline package build.

## Version 11 catalogue search
- Search controls filter visible product/service/port cards as the user types.
- Long select lists receive a search box for countries, services, and platform/category options.
- Large history/admin tables receive a row search.
- Static and syntax checks passed; this is not a live provider integration test.

## v12
Website Products added. Checked: bracket/lexer balance of index.php, JavaScript syntax of the inline form script, static project checks. `php -l` could not be run (no PHP available).

## Follow-up static checks (2026-10-13)
- Six provider/category pricing entry points and filtered service catalogues: checked statically.
- Bulk reset-to-provider-default and per-service/pool markup opt-out: checked statically.
- Searchable Grizzly service/country pool workflow: checked statically; actual number of pools depends on the provider response.
- Nova/Rakib pagination loops: checked statically; actual page semantics must match the provider API.
- Active Numbers view, copy-number/copy-OTP controls, countdown, and page auto-refresh: checked statically.
- Not verified live: MySQL login, Hover/Nova balance response, any provider API key, purchase fulfillment, OTP arrival, provider cancellation, or wallet refund against real provider state.
