# Phase 6 — Final phase (settlement + hardening + ship-readiness)

## What Heetwise is
A **smart expense-splitting** app: groups, multi-currency expenses (4 split types),
USD balances + suggested settlements, and a full statistics module. Phase 6 closes
the loop (recording settlements) and makes the project secure and shippable.

## Context from Phases 1–5 (read STATUS.md for the full breakdown)
- **Money model**: base/settlement amount = integer cents (`Expense.amountCents`,
  `Split.amountCents`). `balance.js` reads ONLY split amounts — do not change it.
- **Expense schema**: `{ id, groupId, description, amountCents (USD cents), currency,
  originalAmount (Decimal), exchangeRate (Decimal CUR→USD), splitType, paidById,
  createdById, timestamps }`. `Split { id, expenseId, userId, amountCents,
  percentage?, weight? }`. `ExchangeRate { id, fromCurrency, toCurrency, rate,
  fetchedAt, fetchedDate }`.
- **Services to follow as patterns**: `splitService` (pure, cents-based, unit-tested),
  `rateService` (only file touching the rate API key; `getRate` is DB-only),
  `statsService` (only file running aggregations; DB does the math via
  aggregate/groupBy/count + parameterized `$queryRaw`), `cacheService`
  (NodeCache TTL 300s; `invalidateGroupStats(groupId)` clears `:group:<id>` keys).
- **Endpoints**: auth; groups CRUD + members; expenses (paginated, multi-currency);
  `/groups/:id/balances`; `/currencies`, `/rates`; `/stats/groups/:id`,
  `/stats/groups/:id/members/:memberId`, `/stats/me`.
- **Auth conventions**: `requireAuth` (JWT httpOnly cookie); `assertMembership`
  (404, no leak) on group domain; `requireGroupMember` (403) on stats.

## Before Phase 6 (still-outstanding setup — NOTHING has run in-build)
1. `npm install` — backend (`node-cron`, `node-cache`) + frontend (`recharts`).
2. `.env` (requires `EXCHANGE_RATE_API_KEY`) + `.env.test`.
3. `npx prisma migrate dev` — creates the full schema (no migrations exist yet:
   covers `add_split_domain` + `add_multicurrency`).
4. `npm run sync-rates` once to populate `exchange_rates`.
5. `npm test`, then smoke-test the whole flow incl. the three stats pages + charts.
   **The smart-split, multi-currency, and statistics code has never been executed —
   run it and fix real failures before building Phase 6.**

## Phase 6 tasks

### 1. Debt settlement (closes the loop)
- Add a `Settlement`/`Payment` model: `{ id, groupId, fromUserId, toUserId,
  amountCents, createdAt }`. Endpoints to record / list / delete (membership-checked).
- Fold settlements into balance math so recording a payment reduces balances.
- **Minimum-transactions algorithm**: `simplifyDebts` already greedily reduces an
  N×N balance set to a near-minimal transaction list — add explicit unit tests
  (already-settled, single debtor/creditor, many-to-many) and confirm it stays
  correct once recorded settlements affect balances.
- **Wire cache invalidation**: the settlement create/delete endpoints MUST call
  `invalidateGroupStats(groupId)` (the hook is already noted in `createExpense`).
- Surface "mark settled" in the UI from the suggested-settlements list, and a
  "settled" state so stats' "unsettled splits" becomes meaningful (today it's all).

### 2. Security hardening
- **IDOR protection / authorization on every endpoint + mutation**: audit all
  routes so each verifies the requester owns/belongs-to the resource (groups,
  expenses, members, settlements, stats). Confirm no endpoint trusts a path id
  without an ownership/membership check.
- **helmet.js** for security headers; **CSRF protection** (the app uses cookie auth,
  so add CSRF tokens / double-submit or SameSite hardening as appropriate).
- **Input sanitization + length limits** consistently via the existing `validation`
  helpers (cap string lengths, reject oversized payloads).

### 3. Cleanup / ship-readiness
- Replace ALL `console.log`/`console.error` with a **winston** logger
  (`index.js`, `errorHandler.js`, `syncRates.js`, `app.js`). Route it through the
  existing API-key redaction so secrets never get logged.
- **Final `.env.example` audit**: every variable the code reads must be present and
  documented (DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN,
  NODE_ENV, AUTH_RATE_LIMIT_*, EXCHANGE_RATE_API_KEY; frontend VITE_API_URL).
- **User-facing README.md**: clone-and-run from scratch — prerequisites (Node 20+,
  Postgres), backend + frontend install, `.env` setup, `prisma migrate`,
  `npm run sync-rates`, starting both servers, running tests, and a feature tour.

### Known follow-ups to fold in (carried from earlier phases)
- **PATCH expense** still only supports EQUAL/EXACT via the legacy
  `participantIds`/`splits[amountCents]` shape — move it onto `splitService` +
  `validateSplit` so updates support PERCENTAGE/WEIGHT + currency like create.
- **`bcrypt` on Node 24** likely fails to build on Windows — switch to `bcryptjs`.
- **`getBalances`** loads all group expenses to sum — consider a SQL aggregate (the
  `statsService` pattern) if groups get large.

### Constraints (unchanged — from CLAUDE.md)
- UUIDs; base money in integer cents (never floats); JWT only in httpOnly cookies;
  secrets server-side only (rate API key only in `rateService` + the redactor);
  parameterized Prisma / `$queryRaw`; `{ data, error, status }` envelope; async/await.
- Don't change `balance.js`'s contract; don't run aggregations outside `statsService`;
  don't call the external rate API outside `rateService`/the cron job.

## After completion
This is the final planned phase. Update STATUS.md to mark the project
feature-complete, and either close out NEXT.md or seed a maintenance/backlog list.
