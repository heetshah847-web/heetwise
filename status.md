Phase: 6 (security hardening) — security layers added; build + unit tests verified

---

## Phase 6 — Security hardening (NEW; additive only)

All of this is an **additive security layer** — no existing feature, UI, response
shape, business logic, split math, rate/stats services, or schema was changed.

### Packages installed
`helmet`, `express-validator` (`express-rate-limit` + `cors` already present).
`csurf` was NOT installed — it's omitted from the spec's actual `npm install` command,
never wired by any step, and is deprecated; CSRF is mitigated by httpOnly + SameSite
cookies + single-origin CORS (noted in SECURITY_AUDIT.md).

### App-wide
- **helmet()** added as the very first middleware (clickjacking / MIME-sniff / XSS / CSP).
- **CORS** locked to `FRONTEND_URL` (new env var; falls back to CLIENT_ORIGIN then
  `http://localhost:5173`). No-Origin requests (tools/tests) allowed; other browser
  origins are rejected → mapped to **403** in the error handler.
- **Global error handler** enhanced: redacts BOTH `EXCHANGE_RATE_API_KEY` and
  `JWT_SECRET` from logs + responses, logs with an ISO timestamp, never returns stack
  traces; generic 500 in production, sanitized message in dev.

### New middleware
- `middleware/handleValidationErrors.js` — turns express-validator failures into a 400
  with a field-error array (kept inside the `{ data, error, status }` envelope).
- `middleware/validators.js` — chains for register / login / group-create /
  expense-create. Optional fields (`name`, `currency`) use `.optional()` so existing
  behavior (nameless register, default-USD) is preserved.
- `middleware/requireExpenseOwnership.js` — 403 unless the requester paid the expense
  or is the group creator (applied to PATCH/DELETE expense).
- `middleware/requireGroupMember.js` (already existed, 403) — now also applied to all
  group **mutation** routes.

### Route protection (decision: **403 on mutations, 404 on reads** for non-members)
- Group mutations (`PATCH/DELETE /groups/:id`, `POST /:id/members`, `POST /:id/expenses`,
  `PATCH/DELETE /:id/expenses/:expenseId`) → `requireGroupMember` (403); expense
  mutations also → `requireExpenseOwnership` (403).
- Group reads keep their existing controller `assertMembership` **404** (hides existence).
- Validators applied to POST `/auth/register`, POST `/auth/login`, POST `/groups`,
  POST `/groups/:id/expenses`.
- Full matrix in **`backend/src/SECURITY_AUDIT.md`** (new).

### Already in place (verified, not duplicated)
- JWT middleware checks the user still exists in the DB → 401 for deleted users.
- bcrypt salt rounds = 12 in register.
- Brute-force limiter: `authRateLimiter` = 10 req / 15 min / IP on `/auth`
  (covers login + register).
- API-key redaction (extended here to also cover JWT_SECRET).

### Env
- `FRONTEND_URL` added to `.env.example` (+ `.env`) with a Vercel-URL comment;
  `NODE_ENV` documented.

### Verified
- All changed files pass `node --check`; `createApp()` boots with the full middleware
  chain; **20 unit tests pass**. Integration tests need a DB (not run here), but the
  one behavior change (non-member mutation 404→403) was reflected in `groups.test.js`.

---

## Phase 5b.1 — Dark theme styling pass (NEW)

The whole frontend is now properly styled with a polished dark theme. **Logic,
routing, props, API calls, and backend were not changed — styling only.**

### Tailwind diagnosis
Tailwind v4 was wired correctly all along (`@tailwindcss/vite` in `vite.config.js`,
`@import "tailwindcss"` in `index.css`, imported in `main.jsx`) — it was NOT broken.
The real reason the app looked unstyled: almost every page used inline `style={{}}`
objects (plain light HTML) with **zero Tailwind classes**, so Tailwind had nothing to
render. Fixed by rebuilding pages with utility classes.

### Theme
- `src/index.css` now defines the exact palette as Tailwind v4 `@theme` tokens:
  bg `#0f0f0f`, surface `#1a1a1a`, border `#2a2a2a`, brand/accent `#6366f1`,
  success `#22c55e`, danger `#ef4444`, muted `#71717a`, fg `#fafafa` — exposed as
  `bg-bg/bg-surface/border-border/text-fg/text-muted/bg-brand-500/text-success/...`.
- Global base layer: dark body, and EVERY input/select/textarea is dark with a subtle
  border + indigo focus ring; dark scrollbars; dark `<option>`s.

### Rebuilt in the dark theme (styling only)
- **New**: `components/Sidebar.jsx` — fixed dark sidebar, lucide icons, indigo active
  state (NavLink), hover transitions, user avatar + logout at the bottom. Mounted in
  `App.jsx` (content offset `md:pl-60`); no routes changed.
- **Pages**: Login, Register, Dashboard (tile cards), Groups (group cards), GroupDetail
  (sticky header + Stats pill + back arrow, avatar-circle members, dark add-member
  input, balance cards with green/red left borders, settlement arrow cards, styled
  add-expense form card, hoverable expense cards), GroupStats / MemberStats / MyStats
  (dark cards + dark-themed Recharts axes/grid/tooltips), Currencies, ProtectedRoute.
- **Components retheme**: Button (indigo accent + dark secondary/ghost), Money,
  CurrencySelect (dark popover), AddExpenseWizard, Fab (dark dialog).

### Verified
- `npm run build` succeeds (3115 modules) and emits a **~27 kB Tailwind CSS** bundle —
  proof Tailwind is generating utilities from the new classes (a broken setup emits
  almost none). No light-theme classes remain (grep-checked).
- (Bundle-size warning for the JS chunk is just recharts/framer-motion/radix size —
  not an error; out of scope for this styling pass.)

---

## Phase 5b — UI/UX overhaul (NEW; foundation delivered, more to iterate)

Approach agreed with the owner: **foundation-first**, and **minimal additive backend
changes are allowed** to wire up UI features that need data/actions the API didn't
expose. Existing features/endpoints were NOT changed in behavior.

### Tooling / dependencies (declared in package.json; not yet `npm install`-ed)
- **Frontend**: tailwindcss + @tailwindcss/vite (Tailwind v4 via Vite plugin, wired in
  `vite.config.js`; `src/index.css` has `@import "tailwindcss"` + theme tokens +
  button keyframes; imported in `main.jsx`), framer-motion, lucide-react, clsx,
  date-fns, react-hot-toast (`<Toaster/>` mounted), @radix-ui/react-{dialog,popover,
  select,tooltip}, recharts (already present).

### Design system (new, shared)
- `lib/cn.js` (clsx wrapper); `lib/currencies.js` (currency metadata: flag/symbol/
  name for the 12 supported + `formatNumber`/`formatMoney`); `components/Money.jsx`
  (symbol-before-number, comma thousands, 2dp, muted code suffix; shows USD equivalent
  beneath non-USD — never a bare USD conversion).
- `components/Button.jsx` — primary (indigo + hover shimmer), destructive (red,
  **two-step confirm** w/ 3s reset), `whileTap` scale 0.96 + click pulse, disabled =
  muted + not-allowed + Radix tooltip reason, loading spinner.
- `components/PageTransition.jsx` + `AnimatePresence` in `App.jsx` — every route change
  fades/slides in from the right, old page out to the left.

### Flagship features delivered
- **Quick-add FAB** (`components/Fab.jsx`) — fixed bottom-right on every signed-in page,
  plus icon rotates 45° on hover; opens a Radix dialog → pick group → wizard.
- **Add-expense wizard** (`components/AddExpenseWizard.jsx`) — 3 steps (Amount &
  Currency / Split Details / Review) with a progress bar, horizontal slide
  transitions, Back button, giant amount input, **searchable currency selector**
  (`components/CurrencySelect.jsx`, flag+code+name), live USD conversion card (rate +
  "updated X ago"), 4 illustrated split-type cards, animated member inputs, review
  card, and submit → spinner → green checkmark. Used by the FAB and reusable per-group.
- **Currencies page** (`pages/Currencies.jsx`, route `/currencies`, linked from
  Dashboard) — base-currency selector, searchable grid of rate cards w/ relative-
  strength mini-bars, a converter widget with an animated swap button, last-updated
  time + a working **Refresh** button.

### Additive backend (authorized; does not change existing behavior)
- `POST /rates/sync` (`currencyController.syncRatesNow`, `requireAuth`) — manual
  refresh that calls the same `fetchAndStoreRates` the cron uses; returns
  `{ stored, updatedAt }`; upstream failure → 503. `api.client.syncRates()` added.

### Design decisions
- Tailwind v4 (CSS-config, no tailwind.config.js); indigo (`brand-*`) accent.
- Currency math on the client is display-only; the server remains authoritative.
- New UI is additive — existing inline-styled pages still render and work; they'll be
  migrated to the design system during the iterate phase.

### NOT yet done (the iterate phase — see NEXT.md)
Per-page redesigns (Splitwise-style expense list + expand + swipe-delete, balance
graph with animated bars/debt cards, dashboard recent feed, group activity feed,
notification center, profile/settings, expense categories, currency filter bar,
sidebar) — several of these need the authorized additive backend (categories column,
activity log, notifications, settlement endpoint, profile/password/delete).

### Unverified
- Backend additive files pass `node --check`. **Frontend is NOT installed/built** —
  no `npm install` (Tailwind, framer-motion, radix, etc.), so the new UI is written
  but unrendered/unverified.

---

Heetwise is a **smart expense-splitting** app (like Splitwise): users form groups,
record who paid for shared expenses (in any supported currency), and the app
computes per-person balances **in USD** plus the minimal set of payments to settle up.

Money model: the base/settlement amount is stored as **integer cents (`amountCents`)**
— the balance service reads only this. Multi-currency adds the original amount +
rate alongside it; it does NOT change how balances are computed.

---

## Phase 5 — Statistics module (NEW)

### Aggregation layer (DB does the math — no raw rows summed in JS)
- `src/services/statsService.js` — the ONLY file that runs aggregation queries.
  Uses Prisma `aggregate` / `groupBy` / `count`; for month-bucketed and
  cross-table sums (which `groupBy` can't express) it uses parameterized
  `$queryRaw` with `EXTRACT`/`date_trunc` (still DB-side, no string concatenation).
  Exports `groupStats`, `memberStats`, `meStats`. All money returned in USD
  dollars (rounded), from `amountCents`/`originalAmount`.
- `src/routes/stats.js` — defines the three endpoints, registered in `app.js`
  under **`/stats`**.

### Endpoints (caching TTL = 300s / 5 min)
- `GET /stats/groups/:groupId` — total_spent, expense_count, average_expense,
  largest_expense, most_active_payer, monthly_breakdown (12 mo), payer_breakdown,
  currency_breakdown. **403 for non-members** (via `requireGroupMember` middleware).
- `GET /stats/groups/:groupId/members/:memberId` — total_paid, total_consumed,
  net_balance, payment/consumption share %, monthly_net_trend (6 mo), top_categories.
  Requester must be the member OR the group **admin (= creator)** → 403 otherwise.
- `GET /stats/me` — total_paid_this_month, total_owed (net), most_active_group,
  six_month_trend, group_breakdown. Auth only (personal, no group guard).

### Caching (`src/services/cacheService.js`)
- Wraps a single `NodeCache` (TTL 300s). Exports `get`, `set`, `del`, and
  `invalidateGroupStats(groupId)` (deletes every key containing `:group:<id>`).
- Each endpoint builds a key from path + user id, returns on hit, else computes →
  caches → returns. `createExpense` calls `invalidateGroupStats` after writing.
- **node-cache** added to backend dependencies.

### New frontend pages (Recharts; all charts in `ResponsiveContainer width="100%"`,
### tooltips on, app palette from `src/theme.js`, USD-formatted values)
- `/groups/:groupId/stats` (`GroupStats.jsx`) — 4 responsive stat cards, 12-month
  spending bar chart, payer pie chart + legend (name/total/%), currency cards.
  Linked from a **Stats** button in the group header.
- `/groups/:groupId/members/:memberId/stats` (`MemberStats.jsx`) — paid/consumed big
  numbers, green/red net balance, 6-month net line chart with a zero `ReferenceLine`,
  top-5 list. Linked from each member name in the group members list.
- `/dashboard/stats` (`MyStats.jsx`) — hero "paid this month", color-coded net owed,
  most-active-group card, dual-line paid-vs-consumed chart with legend, per-group
  breakdown table. Linked from the Dashboard.
- **recharts** added to frontend dependencies; `api/client.js` gained
  `getGroupStats`/`getMemberStats`/`getMyStats`; `src/theme.js` holds COLORS + USD/
  month formatters.

### Reconciliations / known gaps (spec referenced things not yet built)
- **No settlement endpoint exists** (future phase) — its cache-invalidation hook is
  documented in `createExpense` and must be wired when settlement lands.
- **No "settled" flag** — "unsettled" splits = all splits (total_owed/consumed sum all).
- **"admin"** maps to the group **creator** (`createdById`).
- Stats use **403** for non-members per the explicit spec, diverging from the
  404-no-leak convention on other group routes.

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
- `npm install` (backend now also pulls `node-cron` + `node-cache`; frontend now
  pulls `recharts`).
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
