# Phase 4

## What Heetwise is
A **smart expense-splitting** app. Users register, create groups, add members,
record expenses (who paid, split equally or by exact amounts), and see per-person
balances plus the minimal set of payments to settle up. Through Phase 3 it is
**single-currency** (amounts are integer cents, no currency field anywhere).

## Context from Phases 1–3 (read this first)
See STATUS.md for the file-by-file breakdown. In short:
- **Backend**: Express (ESM). Models `User`, `Group`, `GroupMember`, `Expense`, `Split` (Prisma/Postgres, all UUIDs, money as integer cents). Endpoints under `/auth` and `/groups` — all behind `requireAuth`, membership-checked (404 leaks nothing), all in the `{ data, error, status }` envelope. Equal + exact splits, balances + `simplifyDebts` settlements.
- **Expenses list is paginated** (cursor: `?limit=&cursor=`, returns `{ expenses, nextCursor, hasMore }`) — no unbounded queries.
- **Tests**: Vitest + supertest — unit (split/balance math), integration (auth, group/expense isolation, pagination, rate limit). `npm test`.
- **Frontend**: React + Router. Login/Register/Dashboard + `Groups` and `GroupDetail` (members, expenses with "Load more", balances, settlements).

## Before writing Phase 4 code (one-time developer setup, still outstanding)
The build environment had no dependencies or database, so these have NOT happened:
1. `cd backend && npm install`; `cd frontend && npm install`.
2. `.env` files from the `.example` templates (backend + frontend; `.env.test` for tests).
3. `cd backend && npx prisma migrate dev --name add_split_domain` — **the Phase 2 models (groups/expenses/splits) have never been migrated.** Phase 3 added no schema changes (pagination is query-only), so this single migration still covers everything to date.
4. Run `npm test` against a throwaway test DB (see `tests/README.md`). **The test suite has been written across phases 2–3 but never executed here — run it and fix any real-world failures before building Phase 4.**
5. Smoke test: two users, a group, an equal-split expense, confirm balances + settlements + the "Load more" button.

## Phase 4 goal: multi-currency
Single-currency expenses are now complete, so this is the deferred multi-currency
work the product owner flagged.

### Tasks
1. **Currency on expenses** — add a `currency` field (ISO 4217 code, e.g. `USD`) to `Expense`; keep amounts as integer **minor units** (cents/pence/etc., which vary per currency — store the exponent or rely on a lookup). Default existing rows to a base currency via the migration. Validate the code against an allow-list.
2. **Group base currency** — add a `baseCurrency` to `Group`; all balances are reported in the group's base currency.
3. **FX conversion** — record an exchange rate on each expense (or look it up at creation time) so a foreign-currency expense can be converted to the base currency for balance math. Keep `computeBalances`/`simplifyDebts` operating on a single normalized currency (base) — do NOT mix raw amounts of different currencies in the math.
4. **API + validation** — accept `currency` (and optional `rate`) on create/update expense; reject unknown currencies (400). Return both the original amount/currency and the base-currency-normalized amount in expense + balance responses.
5. **Frontend** — currency selector on the add/edit expense form; show original currency on each expense row and the base currency on the balance screen.
6. **Tests** — unit tests for conversion + mixed-currency balance normalization; integration test: expenses in two currencies net out correctly in the base currency.

### Still open from earlier planning (decide whether to fold in first)
These single-currency enhancements were scoped but not built — they may be worth
finishing before/with multi-currency:
- **Settle-up payments**: a `Payment`/`Settlement` model + endpoints, folded into `computeBalances` so recorded payments reduce balances.
- **Expense editing UI**: the `PATCH` endpoint exists; the frontend has no edit form.
- **EXACT split in the UI**: `GroupDetail` only submits EQUAL; add a split-type toggle + per-member amount inputs (validate they sum to the total).
- **Leave/remove member**: `DELETE /groups/:id/members/:userId`; block removal when the member has a non-zero balance (409).

### Constraints (unchanged — from CLAUDE.md)
- All IDs UUIDs; money stays integer minor units (never floats).
- JWT only in httpOnly cookies; env-only config; parameterized Prisma queries.
- All endpoints return `{ data, error, status }`; async/await throughout.
- Membership checks on every `/groups/:id/...` route (404 for non-members).
- Keep `computeBalances`/`simplifyDebts` pure + unit-tested; normalize currency before the math, never inside it.

## After completion
Update STATUS.md with what was built, and update NEXT.md for phase 5.
