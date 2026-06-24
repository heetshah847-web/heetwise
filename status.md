Phase: 3 (complete)

Heetwise is a **smart expense-splitting** app (like Splitwise): users form groups,
record who paid for shared expenses, and the app computes per-person balances and
the minimal set of payments to settle up. **Single currency only** — there is no
currency field anywhere yet (multi-currency is deliberately deferred).

## Phase 3 (single-currency expenses, finalized)
The Phase 3 scope was: expenses table (UUID/amount/description/paid_by/group_id/
created_at), equal-split add-expense endpoint, expense_splits table, balance
endpoint, frontend add-expense + balance screen, and pagination. **All of the
expense/split/balance/UI pieces already shipped in Phase 2** (see below) and are
single-currency (amounts stored as integer cents, never floats). The only piece
not yet present was pagination, which Phase 3 added:
- `GET /groups/:id/expenses` now uses **cursor pagination**: `?limit=` (default 20,
  clamped 1–100) and `?cursor=` (last expense id). Fetches `limit + 1` rows to
  compute `hasMore`; orders by `createdAt desc, id desc` for a stable cursor;
  validates the cursor is a UUID (400 otherwise). No unbounded `findMany` remains.
  Response `data`: `{ expenses, nextCursor, hasMore }`.
- Frontend `api/client.js` `listExpenses(groupId, { cursor, limit })`; `GroupDetail`
  tracks `nextCursor`/`hasMore` and shows a **Load more** button that appends.
- Tests added: pagination (limit + cursor, no page overlap) and invalid-cursor 400.

> Note: Phase 2's NEXT.md described a generic `Item` placeholder and explicitly
> said to "rename to the actual domain entity." The product owner confirmed the
> real domain is smart split, so Phase 2 was built as Groups / Expenses / Splits /
> Balances instead of a throwaway `Item` resource. Same structure the plan
> mandated (membership-based ownership, full CRUD, validation, tests, frontend).

## Built in Phase 1 (still present)
Auth scaffolding: Express app, Prisma+Postgres, `User` model, register/login/logout,
JWT in httpOnly cookie, `requireAuth`, `/auth/me` + `/me`, 10-req/15-min rate limit
on `/auth`, React shell with AuthContext/ProtectedRoute and Login/Register/Dashboard.
See git history / this file's prior version for the full breakdown.

## New in Phase 2

### Data model (Prisma) — all UUIDs, money as integer cents (never floats)
- `Group` — id, name, `createdById` (FK User), timestamps. Indexed on createdById.
- `GroupMember` — join table (groupId, userId), unique per pair, `onDelete: Cascade`. Access control is by membership.
- `Expense` — id, groupId (cascade), description, `amountCents` (Int), `splitType` enum (EQUAL|EXACT), `paidById`, `createdById`, timestamps. Indexed on groupId + paidById.
- `Split` — id, expenseId (cascade), userId, `amountCents`. Unique per (expense, user).
- Relations added to `User` (groupsCreated, memberships, expensesPaid, expensesCreated, splits).

### Domain logic (pure, unit-tested — `src/utils/`)
- `split.js` — `computeEqualSplits` (distributes remainder cents so splits always sum to the total) and `buildExactSplits` (validates exact amounts sum to total).
- `balance.js` — `computeBalances` (net cents per user; always sums to zero) and `simplifyDebts` (greedy minimal-transaction settlement — the "smart" part).

### Validation + errors
- `src/utils/errors.js` — typed `AppError` subclasses (Validation 400, Unauthorized 401, Forbidden 403, NotFound 404, Conflict 409).
- `src/utils/validation.js` — reusable `requireString/optionalString/requireInt/requireEmail/requireUuid/requireArray/requireEnum`, each throwing `ValidationError`.
- `errorHandler` now maps `AppError` and Prisma `P2002`/`P2025` to the right status, all in the `{ data, error, status }` envelope.

### Services
- `src/services/membership.js` — `assertMembership` (throws 404 for non-members so existence isn't leaked) and `getGroupMemberIds`.

### Endpoints (all behind `requireAuth`, all in the standard envelope)
- `POST /groups` (creator auto-added as member), `GET /groups` (only the user's groups), `GET /groups/:id`, `PATCH /groups/:id`, `DELETE /groups/:id` (creator only → 403 if member-but-not-creator).
- `POST /groups/:id/members` (add by email; 404 if no such user, 409 if already a member).
- `GET /groups/:id/balances` (net balances + simplified settlements, with user info; zero-activity members included).
- `POST/GET/GET:expenseId/PATCH/DELETE` under `/groups/:id/expenses` — EQUAL split takes `participantIds`, EXACT takes `splits[]`; payer + all participants validated as group members; PATCH replaces splits atomically in a transaction. 404 if the expense isn't in the group.

### Rate limiting
- `rateLimit.js` refactored to a `createAuthRateLimiter({ max, windowMs })` factory; defaults from new env vars `AUTH_RATE_LIMIT_MAX` (10) / `AUTH_RATE_LIMIT_WINDOW_MS` (900000). Still applied only to `/auth`, never to `/groups`.

### Tests (`backend/tests/`, Vitest + supertest)
- `tests/unit/` — split + balance math (no DB). Runnable with `npm run test:unit`.
- `tests/integration/auth.test.js` — register/cookie/UUID, bad password 401, duplicate 409, `/auth/me` rejects missing + invalid cookie, returns user with valid cookie.
- `tests/integration/groups.test.js` — creator-as-member, equal-split balances + settlement correctness, non-members get 404 on read AND mutate (isolation), `GET /groups` scoping, exact-split mismatch → 400.
- `tests/integration/rateLimit.test.js` — dedicated 2-request limiter returns 429 on the 3rd (no DB).
- `vitest.config.js` (serial files, node env, loads `tests/setup.js`), `tests/setup.js` (loads `.env.test`), `tests/helpers/` (db reset + authed agent), `tests/README.md`.
- `package.json` scripts: `test`, `test:unit`, `test:watch`. Dev deps: vitest, supertest.

### Frontend
- `api/client.js` extended with group/expense methods + `toCents`/`formatCents` helpers (UI uses dollars, API uses cents). Still `credentials: 'include'`, never localStorage.
- `pages/Groups.jsx` — list + create groups.
- `pages/GroupDetail.jsx` — members + add-member, balances + suggested settlements, expenses list + add (equal split with payer select & participant checkboxes) + delete.
- Routes for `/groups` and `/groups/:groupId` (protected) in `App.jsx`; Dashboard links to groups.

## Verified
- All 27 backend `.js` files pass `node --check` (syntax). 
- Logic reviewed for the CLAUDE.md rules: UUIDs everywhere, cookie-only JWT, env-driven config, parameterized Prisma queries, consistent envelope, async/await throughout.

## Not yet done (needs the developer — no deps/DB in build env)
- `npm install` in `backend/` and `frontend/` (adds vitest/supertest too).
- Run a migration for the new models: `npx prisma migrate dev --name add_split_domain`.
- Create `.env` (and `.env.test` from `.env.test.example` for a throwaway test DB).
- Run the suite: `npm test`. Integration tests need the test DB migrated first (`prisma migrate deploy` / `db push`). **Tests are written but have not been executed in this environment.**

## Environment variables in use
Backend: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN, NODE_ENV, AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS
Frontend: VITE_API_URL
