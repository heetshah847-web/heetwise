# Phase 5

## What Heetwise is
A **smart expense-splitting** app. Users form groups, record who paid for shared
expenses (in any supported currency), and the app shows per-person balances **in
USD** plus suggested settlements. Through Phase 4 it has four split types
(EQUAL/EXACT/PERCENTAGE/WEIGHT) and multi-currency with cached exchange rates.

## Context from Phases 1–4 (read STATUS.md for the full breakdown)
- **Money model**: base/settlement amount is integer cents (`Expense.amountCents`,
  `Split.amountCents`). `balance.js` reads ONLY split amounts and must not change.
- **Expense schema shape** (what Phase 5 builds on):
  `Expense { id, groupId, description, amountCents (USD cents), currency,
  originalAmount (Decimal, as-entered), exchangeRate (Decimal CUR→USD), splitType,
  paidById, createdById, createdAt, updatedAt }`.
  `Split { id, expenseId, userId, amountCents, percentage?, weight? }`.
  `ExchangeRate { id, fromCurrency, toCurrency, rate, fetchedAt, fetchedDate }`.
- **splitService pattern to follow**: `calculateSplits(totalAmount, splitType,
  members)` in `src/services/splitService.js` is a PURE function that does all math
  in integer cents and guarantees the shares sum exactly to the total. Any new
  split-related math should follow this pattern (pure, cents-based, unit-tested),
  and `validateSplit.js` should guard inputs before the controller.
- **rateService isolation**: `src/services/rateService.js` is the ONLY file allowed
  to touch `EXCHANGE_RATE_API_KEY` or the external API. Everything else uses
  `getRate()` (DB-only). Keep it that way — never call the external API inline in a
  request; only the cron/`syncRates` job fetches.
- **Endpoints**: groups CRUD, members, expenses (paginated), `GET /groups/:id/balances`
  (balances + `simplifyDebts` settlements), `GET /currencies`, `GET /rates`.

## Before Phase 5 (outstanding setup — none of this has run in-build)
1. `npm install` (backend + frontend); backend now needs `node-cron`.
2. `.env` (now requires `EXCHANGE_RATE_API_KEY`) + `.env.test`.
3. `npx prisma migrate dev` to create the full schema (no migrations exist yet —
   this covers `add_split_domain` + `add_multicurrency`).
4. `npm run sync-rates` once to populate `exchange_rates`.
5. `npm test`, then smoke-test: USD expense, a non-USD expense (after sync), balances.
   **Verify the Phase 3–4 code actually runs and fix real failures before Phase 5.**

## Phase 5 goal: settlement, history, polish, and ship-readiness

### Tasks
1. **Debt settlement (record payments)**: add a `Payment`/`Settlement` model
   (groupId, fromUserId, toUserId, amountCents, createdAt) and endpoints to record /
   list / delete one. Fold payments into balance math so settling reduces balances.
   Keep the math pure + unit-tested (mirror splitService). Surface "mark as settled"
   in the UI from the suggested-settlements list.
2. **Simplified-debt algorithm**: `simplifyDebts` already reduces an N×N balance set
   to a near-minimal transaction list (greedy). Phase 5 should add explicit unit
   tests for edge cases (already-settled, single debtor/creditor, many-to-many) and
   confirm it stays in sync once recorded payments affect balances.
3. **Expense history with filters**: extend `GET /groups/:id/expenses` with filters
   (by payer, by currency, by date range, by split type) on top of the existing
   cursor pagination. Add a filter bar to the expenses UI.
4. **Responsive UI polish**: the current pages use inline styles and fixed widths.
   Make them responsive (mobile-friendly), extract shared styling, improve the
   add-expense form layout for the per-member split inputs.
5. **Final cleanup / ship-readiness**:
   - Replace all `console.log`/`console.error` with a proper logger (e.g. pino) —
     there are calls in `index.js`, `errorHandler.js`, `syncRates.js`. Ensure the
     logger still routes through the API-key redaction.
   - Verify `.env.example` is complete and matches every variable actually read
     (DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN, NODE_ENV,
     AUTH_RATE_LIMIT_*, EXCHANGE_RATE_API_KEY; frontend VITE_API_URL).
   - Write a user-facing **README.md** explaining how to clone and run from scratch:
     prerequisites (Node, Postgres), backend + frontend install, `.env` setup,
     `prisma migrate`, `npm run sync-rates`, starting both servers, running tests.

### Known follow-ups to fold in (carried from earlier phases)
- **PATCH expense** still only supports EQUAL/EXACT via the legacy
  `participantIds`/`splits[amountCents]` shape. Bring it onto `splitService` +
  `validateSplit` so updates support PERCENTAGE/WEIGHT and currency like create does.
- **`bcrypt` on Node 24**: native build likely fails on the dev's Windows machine —
  consider switching to `bcryptjs` (pure JS, drop-in) to unblock `npm install`.
- **`getBalances` loads all expenses** for a group (needed to sum) — fine for now,
  but consider a SQL aggregate if groups get large.

### Constraints (unchanged — from CLAUDE.md)
- UUIDs everywhere; base money in integer cents (never floats); JWT only in httpOnly
  cookies; env-only secrets (API key server-side only, never in the client bundle);
  parameterized Prisma; `{ data, error, status }` envelope; async/await throughout.
- Do not modify `balance.js`'s contract (reads final split amounts); do not call the
  external rate API outside `rateService` / the cron job.

## After completion
Update STATUS.md, and update NEXT.md for phase 6 (or mark the project feature-complete).
