Phase: 4 (multi-currency) — complete (code), unverified at runtime

Heetwise is a **smart expense-splitting** app (like Splitwise): users form groups,
record who paid for shared expenses (in any supported currency), and the app
computes per-person balances **in USD** plus the minimal set of payments to settle up.

Money model: the base/settlement amount is stored as **integer cents (`amountCents`)**
— the balance service reads only this. Multi-currency adds the original amount +
rate alongside it; it does NOT change how balances are computed.

---

## Phase 4 — Multi-currency (NEW)

### Schema (Prisma)
- `Expense` gained: `currency` (String, default `USD` — added in the smart-split
  phase), `originalAmount` (`Decimal(14,2)` — what the user typed, in `currency`),
  `exchangeRate` (`Decimal(18,8)` — the CUR→USD rate used at creation, 1 for USD).
  `amountCents` continues to hold the **converted USD** amount, so `balance.js` is
  untouched (it carries a "do not modify" comment).
- New `ExchangeRate` table (`exchange_rates`): `id` (UUID), `fromCurrency`,
  `toCurrency`, `rate` (`Decimal(18,8)`), `fetchedAt` (DateTime), `fetchedDate`
  (`@db.Date`). Unique on `(fromCurrency, toCurrency, fetchedDate)` → one rate per
  pair per day (Prisma can't index `date(fetched_at)` directly, hence the explicit
  `fetchedDate` column). Indexed on `(fromCurrency, toCurrency, fetchedAt)`.
- Migration name to run: **`add_multicurrency`** (not run here — see caveats).

### rateService isolation pattern (`src/services/rateService.js`)
- The **only** file allowed to read `EXCHANGE_RATE_API_KEY` or call the external
  rate API. Throws at import if the key is missing (hard startup error).
- `fetchAndStoreRates()` — the only function that hits the network. Fetches
  USD-based rates, stores each supported currency as a **CUR→USD** row (inverse of
  the API's USD→CUR), upserts on the daily-unique key, returns the count stored.
- `getRate(from, to)` — DB-only lookup of the most recent rate; **never** calls the
  API. Throws a descriptive "run npm run sync-rates first" error if nothing cached.
- Supported currencies: USD, EUR, GBP, JPY, CAD, AUD, INR, CNY, CHF, MXN, BRL, SGD.

### Cron / job
- `src/jobs/syncRates.js` — standalone script: calls `fetchAndStoreRates`, logs
  count + timestamp, exits 0; on error logs the message only (no key) and exits 1.
  `npm run sync-rates` runs it.
- `src/index.js` (startup file) — on `listen`, calls `fetchAndStoreRates` once
  immediately, then schedules it **hourly** via `node-cron` (`0 * * * *`). Both are
  wrapped so an unreachable API logs a failure but never crashes the server.

### Endpoints
- `POST /groups/:id/expenses` now accepts `currency`. USD (or missing) → stored as
  `originalAmount = amount`, `exchangeRate = 1`, `amountCents = amount*100`.
  Non-USD → `getRate(cur,'USD')` (BEFORE the transaction); converts to USD for
  `amountCents`, stores `originalAmount` + `exchangeRate`. If no rate is cached it
  returns a clear **503** (not a 500). Splits are computed on the USD amount (EXACT
  per-member amounts are converted too) so balances stay in USD.
- `GET /currencies` (auth) — distinct `fromCurrency` values with cached rates, sorted.
- `GET /rates` (auth) — `{ rates: {CUR: CUR→USD}, updatedAt }` for the UI's live
  USD hint and the balance "rates last updated" line (display only). *(Added beyond
  the literal spec because `/currencies` returns only an array and can't carry rates.)*

### Security
- `errorHandler` scrubs `EXCHANGE_RATE_API_KEY` → `REDACTED` in any logged or
  returned message/stack. The key is referenced only in `rateService.js` and (as
  the spec directs) the sanitizer.

### Frontend
- `api/client.js`: `listCurrencies()`, `getRates()`.
- `GroupDetail`: currency dropdown next to the amount (populated from `/currencies`);
  a live "≈ $X USD" hint for non-USD; expense rows show **original amount + currency**
  with the USD equivalent in smaller muted text; balance section header states all
  balances are in USD and shows the last rate-update timestamp.

### Env
- `EXCHANGE_RATE_API_KEY` added to `.env.example` (server-side-only secret;
  required to start; run `npm run sync-rates` once first). Dummy value added to
  `.env.test.example` (the app imports rateService, which requires the key).
- `node-cron` added to dependencies; `sync-rates` script added.

---

## Smart split (the prior phase — now documented)
The four split types: **EQUAL, EXACT, PERCENTAGE, WEIGHT**.
- `SplitType` enum extended to all four; `Split` gained nullable `percentage`
  (`Decimal(7,4)`) and `weight` (`Decimal(12,4)`).
- `src/services/splitService.js` — `calculateSplits(totalAmount, splitType, members)`;
  math done in integer cents internally so results always sum exactly to the total;
  remainder rules per spec (first member for EQUAL; highest %/weight for PERCENTAGE/
  WEIGHT). Returns `[{ userId, amount }]`.
- `src/middleware/validateSplit.js` — 400s for empty members, non-member userIds,
  EXACT≠total, percentages≠100, non-positive weight, invalid splitType. Runs before
  `createExpense`.
- `POST /groups/:id/expenses` body: `{ description, amount (number), currency, paidBy,
  splitType, members: [{ userId, amount?|percentage?|weight? }] }`. Expense + splits
  written in one transaction.
- `balance.js` reads final amounts from splits, so it is unchanged by split types
  (carries an explicit "do not modify" comment).
- PATCH `/expenses/:id` still uses the legacy EQUAL/EXACT path (`participantIds`/
  `splits[amountCents]`) — PERCENTAGE/WEIGHT on update is a follow-up (see NEXT.md).
- Tests: `tests/unit/splitService.test.js` (all four types + sum invariants + errors);
  `groups.test.js` updated to the new body shape + PERCENTAGE/WEIGHT cases.

## Phases 1–3 (still present, condensed)
- **Auth**: register/login/logout, JWT httpOnly cookie, `requireAuth`, `/auth/me`+`/me`,
  10-req/15-min limiter on `/auth` (configurable factory).
- **Groups domain**: `Group`, `GroupMember` (membership = access control, 404 leaks
  nothing), full groups CRUD, add-member-by-email, balances + `simplifyDebts`.
- **Pagination**: `GET /groups/:id/expenses?limit=&cursor=` → `{ expenses, nextCursor,
  hasMore }`; no unbounded queries.
- Standard `{ data, error, status }` envelope; typed errors; reusable validators.

## Verified
- All backend `.js` files pass `node --check` (syntax).
- Reviewed against CLAUDE.md rules: UUIDs, cookie-only JWT, env-driven config (the
  API key never reaches the client bundle), parameterized Prisma, consistent envelope,
  async/await.

## NOT verified / outstanding (no deps, DB, or network in the build env)
- `npm install` (now also pulls `node-cron`); frontend install too.
- **Migrations have never been run.** Run `npx prisma migrate dev` — it will create
  the full schema including `add_split_domain` + `add_multicurrency` changes.
- Create `.env` (now requires `EXCHANGE_RATE_API_KEY`) and `.env.test`.
- `npm run sync-rates` once to populate `exchange_rates` before non-USD expenses work.
- **Nothing has been executed at runtime** — the smart-split and multi-currency code
  (and all tests) are written and syntax-clean but unrun. The external rate API, the
  cron job, and the conversion path have not been exercised.

## Environment variables in use
Backend: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN, NODE_ENV,
AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS, **EXCHANGE_RATE_API_KEY**
Frontend: VITE_API_URL
