Phase: 11 (Security + reliability hardening — audit fixes)

---

## Phase 11 — Hardening pass (audit fixes; additive + one migration)

Fixed the issues found in the full-codebase audit. Targeted changes only; no
feature behavior removed. Frontend `npm run build` succeeds (3125 modules),
backend **20/20 unit tests pass**, `prisma validate` clean, `createApp()` boots.

### ⚠️ DEPLOY STEP — apply the new migration BEFORE (or with) deploying
One new migration **`20260804120000_hardening`** adds three columns. The code
expects them, so run this against Neon before the new backend serves traffic
(same workflow as every prior phase):
```
cd backend && npx prisma migrate deploy
```
Columns added: `users.token_version` (default 0), `expenses.deleted_at` (nullable),
`expenses.idempotency_key` (nullable, unique). All additive + backfilled — no data
loss, and existing JWTs stay valid (missing version claim is treated as 0).

### Security
- **JWT logout invalidation** (was: copied token worked for 7 days). `User.tokenVersion`
  is embedded in the JWT (`utils/jwt.js`) and checked in `middleware/auth.js`;
  `POST /auth/logout` bumps it, so every prior token for that user is rejected.
- **Pusher private channels** (was: anyone who knew a group id could subscribe).
  Channels are now `private-group-<id>` / `private-user-<id>`; new authenticated
  endpoint **`POST /pusher/auth`** (`controllers/pusherController.js`) signs a
  subscription only for the matching user or a group member. Frontend authorizes
  via `lib/pusherClient.js` `customHandler` (sends the cookie, `credentials:'include'`).
- **Settlement authorization**: `createSettlement` now requires the caller to be
  one of the two parties (was: any member could settle others' debts). The recorded
  amount is the **server-computed outstanding**, never the client value, so a stale/
  tampered amount can't corrupt the ledger.
- **Cron endpoint guard**: `/notifications/send-reminders` honors an optional
  `CRON_SECRET` (Vercel Cron sends the bearer token automatically). Unset = open,
  so existing deploys are unaffected.

### Correctness / data integrity
- **Soft delete for expenses** (`expenses.deleted_at`): `deleteExpense` stamps
  `deletedAt` instead of hard-deleting (audit trail). Every expense read filters
  `deletedAt IS NULL` — group balances, `/balances/summary`, notifications, the
  reminder sweep, and all of `statsService` (Prisma aggregates + the `$queryRaw`
  month buckets).
- **Idempotent expense create** (`expenses.idempotency_key`): the client sends a
  stable key per submit (`GroupDetail`, `AddExpenseWizard`); a duplicate/retry
  returns the existing expense instead of inserting a second one (unique index
  guards the race).
- **MemberStats "Settle Up" was silently a no-op** (wrong `intent` shape → empty
  `groups` array → success toast, zero settlements). Now builds the shape
  `SettleUpModal` expects, so it actually records the settlement.

### Performance
- **N+1 removed** in `getNotifications`, `scheduleDebtReminders` (were 2 queries
  per group → 2 queries total, bucketed in memory) and `meStats` per-group consumed
  (N aggregates → 1 grouped query).
- **Per-group balances are now cached** (`balances:group:<id>`, node-cache, same
  invalidation as stats) instead of recomputing on every request.
- **usePusher ref-counts subscriptions** so one component unmounting no longer
  tears down a channel shared by others (bell / requests / summary all use the
  user channel).
- **Prisma client + pg Pool reused** via a `globalThis` guard (avoids pool churn /
  connection exhaustion on serverless).
- Over-fetching trimmed: user relations now `select` id/email/name instead of
  pulling full rows (incl. `password_hash`) into memory across group/expense/
  settlement/invitation queries.

### Smaller items
- `/health` now issues `SELECT 1` (warms the serverless DB pool for any external
  uptime pinger) and reports `{ status, db }`.
- Fetch effects in the stats pages (`GroupStats`, `MemberStats`, `MyStats`) guard
  against setState-after-unmount.
- Dropped a raw user id from a push error log.

---

## Phase 10 — Settle Up (end-to-end) + settlement tracking + browser push

Made "Settle Up" actually work: recording a settlement now marks the underlying
debt as paid, drops the balance to zero everywhere, cascades live to every
surface, and (optionally) fires browser push notifications. Two migrations were
added and applied to the Neon DB.

### Schema + migrations (applied via `prisma migrate deploy`)
- **`Split.isSettled Boolean @default(false)`** (`is_settled` column) — migration
  **`20260803120000_add_settlement_tracking`**. A split flagged settled no longer
  counts toward anyone's balance.
- **`PushSubscription`** model → **`push_subscriptions`** table (id, userId FK→users
  ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth, createdAt) — migration
  **`20260803120100_add_push_subscriptions`**.

### Fix 1 — Settle Up visibility
- **Summary** (`pages/Summary.jsx`): Section 2 (**Owes you**) keeps the green
  **Settle Up** button; Section 3 (**You owe**) now shows an informational
  **Pay Back** label with no action.
- **GroupDetail** balances: **Settle Up** shows next to a suggested settlement
  **only when that person owes the current user** (`s.to === me`); the reverse
  leg shows a passive **Pay Back** label.

### Fix 2 — Settle Up works end-to-end (`POST /groups/:groupId/settlements`)
`controllers/settlementController.js` rewritten to run **one interactive Prisma
transaction** that: (1) verifies the caller is a group member; (2) verifies both
parties are members; (3) verifies there is a real outstanding debt where
`fromUser` owes `toUser` (aggregate of unsettled splits, both directions —
rejects with 400 if none); (4) creates the `Settlement`; (5) marks **all** splits
representing debt between the two users in this group (both directions) as
`isSettled = true` (a full settle → pairwise balance = 0). Returns
`{ settlement, balance:{ fromUserId, toUserId, netAmountCents:0 } }`.
- Balance surfaces are now **settlement-aware** via a new pure helper
  `utils/balance.js → withoutSettledSplits(expenses)` (drops settled splits AND
  the payer's credit for them, preserving the zero-sum invariant). Applied in
  `groupController.getBalances`, `balanceController.getBalancesSummary`, and
  `notificationController.getNotifications`. `computeBalances`/`simplifyDebts`
  were **not** modified.

### Fix 3 — Real-time cascade
- Backend emits, after commit: `group-<id>` **`settlement-created`**
  `{ fromUserId, toUserId, amountCents, settlement }`, plus **`balance-updated`**
  on `user-<fromUserId>` and `user-<toUserId>`.
- Frontend: **GroupDetail** listens for `settlement-created` → refetches balances,
  expense list, and settlement history. **Summary** listens on its user channel
  for `balance-updated` → silent refetch.

### Fix 4 — Downstream data updates
- Group balances show zero between settled users; the **Activity** feed shows a
  green-checkmark settlement entry at the top; personal Summary drops/zeros the
  settled person; the sidebar owe-badge recomputes (route change + live).
- **Cache invalidation**: settlement invalidates group stats
  (`invalidateGroupStats`) and both parties' summary cache. The summary endpoint
  is now **node-cache-backed** (`summary:user:<id>`); a new
  `cacheService.invalidateSummaries(userIds)` is also called on every expense
  create/update/delete so summaries never go stale.

### Fix 5 — Settlement confirmation modal (`components/SettleUpModal.jsx`)
Rewritten to a single reusable confirmation modal (used by Summary, GroupDetail,
NotificationBell): other person's avatar + name, exact amount (with USD
equivalent), per-group breakdown, the message *"This will mark all debts between
you and NAME as settled"*, Cancel + a **bright green Confirm Settlement** button
that shows a spinner and is disabled while the API call is in flight. Success →
green toast *"Settled up with NAME successfully"* + close; error → red toast with
the exact message, modal stays open. Posts one settlement per contributing group.

### Fix 6 — Settlement history
- **`GET /groups/:groupId/settlements`** (`listSettlements`, member-only → 404):
  all past settlements, newest first, each with from/to user, amount, currency,
  `settledAt`.
- **GroupDetail** gained a **Settlement History** tab (timeline cards: green
  check, "X paid Y", amount, date) beside the new **Activity** tab.

### Fix 7 — Browser push notifications
- `npm install web-push`; VAPID keypair generated and stored as
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` (backend `.env`,
  `.env.example` placeholders) and `VITE_VAPID_PUBLIC_KEY` (frontend).
- **`services/notificationService.js`** (optional, no-op without VAPID):
  `sendPushNotification(userId, {title, body, icon, url})` (fans out to the
  user's `push_subscriptions`, prunes dead 404/410 endpoints) and
  `scheduleDebtReminders()` (all unsettled debts >7 days, grouped by debtor,
  "You owe NAME $AMOUNT — tap to settle up" → summary link).
- Endpoints: **`POST /notifications/subscribe`** (auth, upsert by endpoint) and
  **`GET /notifications/send-reminders`** (unauthenticated cron target → returns
  `{ sent }`).
- Triggers: new expense → all members except payer; invitation → invitee;
  settlement completed → the person who was owed; daily reminders → debtors.
- Frontend: `lib/push.js` (service worker registration + subscribe, VAPID key
  decode), `public/sw.js` (push + notificationclick), and
  `components/NotificationPermissionBanner.jsx` — a dismissable top banner
  ("Enable notifications…"/Enable/Dismiss, `localStorage` dismiss flag; silent
  re-subscribe when already granted), wired into `App.jsx`.
- **Cron**: root **`vercel.json`** (and `backend/vercel.json`) with a daily
  `30 3 * * *` UTC cron (= **9:00 AM IST**) hitting `/notifications/send-reminders`.

### Verified
- Migrations applied to Neon (`is_settled` present, `push_subscriptions` created);
  Prisma relation-filter aggregate/updateMany shape validated against the live DB.
- Backend `app.js` imports/boots cleanly; **20/20 unit tests pass**.
- Frontend `npm run build` succeeds (3125 modules).

### Design decisions / notes
- Settlements are **full-settle** per group (mark all pairwise debts settled),
  matching the modal copy; the old partial/custom-amount UI on Summary was
  removed in favor of the unified confirmation modal.
- **Group stats** are expense-derived (who paid what) and are **not** rewritten to
  subtract settled amounts — settling a debt doesn't change history — but the
  stats cache is still invalidated so the page recomputes. Balance/summary/
  notification surfaces are the ones made settlement-aware.
- Both `pusherService` and `notificationService` remain **optional**: absent
  credentials make broadcasts/pushes safe no-ops.

---

## Phase 9 — Cross-group balance summary (NEW; additive only)

A new **Summary** page + a new endpoint that nets out what every person owes the
current user (and vice-versa) across ALL their groups combined. Nothing existing
was changed — no routes, controllers, UI, or schema were touched; this is purely
additive.

### Backend — new endpoint
- **`GET /balances/summary`** (auth) in the **new** file
  `src/routes/balanceRoutes.js`, mounted in `app.js` under **`/balances`**.
  Handler: `controllers/balanceController.js` → `getBalancesSummary`.
- Computation (one Prisma round-trip: `group.findMany` where the user is a member,
  selecting members→user and expenses→splits, then reduced in memory):
  for the current user, for every OTHER user they share ≥1 group with, net =
  Σ(other's split cents in expenses the CURRENT user paid)  −  Σ(current user's
  split cents in expenses the OTHER user paid), summed across ALL shared groups.
  **Positive ⇒ the other person owes the current user; negative ⇒ current user
  owes them.** All math uses the authoritative `split.amountCents` (already USD) —
  exchange rates are NEVER re-applied here (same rule as `utils/balance.js`).
- Response `data`: `{ balances[], totalOwedToMe, totalIOwe, currency:'USD',
  generatedAt }`. Each `balances[]` item:
  `{ otherUserId, otherUserName, otherUserEmail, netAmountCents (number),
  currency:'USD', groupBreakdown:[{ groupId, groupName, netAmountCents }] }`.
  `groupBreakdown` includes only groups with a non-zero contribution (signed).
  `totalOwedToMe` = Σ positive nets; `totalIOwe` = Σ |negative nets| (absolute).
  Co-members with a net of exactly zero are still returned (empty breakdown) so
  the client can distinguish "shared but settled" from "no shared groups".

### Frontend — new Summary page
- **`pages/Summary.jsx`**, route **`/summary`** (in `App.jsx`, auth-guarded), added
  to the sidebar as **Summary** with a **balance (`Scale`) icon**.
- Three sections:
  1. **Hero cards** — "Total you are owed" (green) + "Total you owe" (red), then a
     net card: positive ⇒ "Overall you are owed $X" (green), negative ⇒ "Overall
     you owe $X" (red), zero ⇒ "All settled up" (green).
  2. **Owes you** — one card per person (avatar initial, name, email, total in big
     green text). Expand to reveal the per-group breakdown; **Settle Up** opens a
     modal (full amount or custom).
  3. **You owe** — same card design, amounts in red, Settle Up (you pay them).
- Settle Up: the modal offers full or custom amount and, on confirm, greedily
  allocates it across the person's contributing groups and calls
  **`POST /groups/:groupId/settlements`** once per group (direction picks payer/
  payee: they-owe-you ⇒ from=them/to=you; you-owe ⇒ from=you/to=them). Re-fetches
  the summary afterwards.
- **Skeleton** loading state; **empty state** ("You are all settled up" with a
  celebratory illustration) when both totals are zero; a **Last updated <relative>**
  line (from `generatedAt`) and a **Refresh** button (spinning icon) at the bottom/top.
- `api/client.js` gained `getBalancesSummary()`.

### Sidebar debt badge
- `components/Sidebar.jsx` fetches the summary on mount + on every route change and
  shows a **red count badge** on the Summary nav item = number of people the user
  owes money to (`netAmountCents < 0`), so outstanding debts are visible at a glance.
  Fetch failures are silent (non-critical UI).

### Verified
- Backend: all new files pass `node --check`; **20/20 unit tests pass**; `app.js`
  imports/boots cleanly with the new `/balances` mount.
- Frontend: `npm run build` succeeds (3123 modules, +1 for the new page).
- Design decisions: balances shown here are **raw pairwise** nets (who paid for
  whose share), per the spec — NOT the greedy `simplifyDebts` plan used elsewhere;
  the two can differ and that's intentional. Settlements remain an audit trail and
  do not alter how balances are computed.

---

## Phase 8 — Invitations, settle-up, notifications, real-time, CORS (NEW)

Six fixes/features. New tables + endpoints are additive; the two behavior
changes are (a) adding a member now creates an INVITATION instead of joining
directly, and (b) CORS now accepts a list of origins.

### Fix 1 — Multi-origin CORS
- `config/env.js` now exposes `frontendUrls` (array) parsed from `FRONTEND_URL`,
  which may be a **comma-separated list**. `frontendUrl` (first entry) kept.
- `app.js` CORS callback allows an origin if it is in `frontendUrls` (no-Origin
  requests still allowed; anything else → 403 via the error handler, unchanged).
- `.env` / `.env.example`: `FRONTEND_URL` documented as comma-separated; local
  `.env` set to `http://localhost:5173,https://heetwise.vercel.app,https://heetwise-wnkk.vercel.app`.

### Fix 2 — SPA routing on Vercel / iOS refresh 404
- `frontend/public/_redirects` → `/*  /index.html  200` (copied into `dist/`).
- `frontend/vercel.json` → `{"rewrites":[{"source":"/((?!api).*)","destination":"/index.html"}]}`.

### Fix 3 — Group invitations
- Schema: `InvitationStatus` enum (PENDING/ACCEPTED/DECLINED) + `GroupInvitation`
  model (`group_invitations`): id, groupId, invitedEmail, invitedUserId?,
  invitedById, status, createdAt, expiresAt (7-day TTL). Relations added to
  User (`invitationsSent`/`invitationsReceived`) and Group (`invitations`).
  Also added nullable `Group.description` (shown to invitees).
- Migration: **`20260802120000_add_group_invitations`** (APPLIED to the DB).
- `controllers/invitationController.js`:
  - `createInvitation` — used by BOTH `POST /groups/:groupId/members` (repointed)
    and `POST /groups/:groupId/invitations`. Guards: group exists, invitee not
    already a member, no duplicate PENDING invite. Fires Pusher
    `invitation-received` on `user-<invitedUserId>` when the invitee has an account.
  - `getPendingInvitations` → `GET /invitations/pending` (own email, PENDING,
    non-expired).
  - `acceptInvitation` → `POST /invitations/:id/accept` (idempotent membership
    upsert + status ACCEPTED; 400 if not pending/expired; 404 if not addressed
    to the caller).
  - `declineInvitation` → `POST /invitations/:id/decline`.
- `routes/invitationRoutes.js` mounted at `/invitations`. The old
  `groupController.addMember` (direct add) was removed — replaced by the invite flow.
- Frontend: `pages/Requests.jsx` (route `/requests`, **Requests** tab in the
  sidebar) — pending invites with group name/description, owner, inviter,
  Accept/Decline; live-refreshes on `invitation-received`. GroupDetail's
  add-member form now says **Invite** and toasts "Invitation sent".

### Fix 4 — Settle up + notifications
- Schema: `Settlement` model (`settlements`): id, groupId, fromUserId, toUserId,
  amountCents, currency, settledAt, createdAt. Relations on User/Group.
- Migration: **`20260802120100_add_settlements`** (APPLIED to the DB).
- `controllers/settlementController.js` → `POST /groups/:groupId/settlements`
  (both parties must be members; `fromUserId != toUserId`; invalidates group
  stats cache; fires Pusher `expense-settled` on `group-<id>`).
- `controllers/notificationController.js` → `GET /notifications`: for each of
  the user's groups, computes balances (`utils/balance.js`), takes the simplified
  settlement legs involving the user, keeps those whose **oldest expense is > 7
  days old** and that have **no Settlement recorded in the last 7 days**. Each
  item: `{ type:'UNSETTLED_DEBT', direction, groupId, groupName, otherPersonId,
  otherPersonName, amountCents, currency }`. NOTE: balances are still computed
  from expenses only — settlements are an audit trail + notification driver and
  do **not** alter `computeBalances` (kept per "don't change what isn't asked").
- Frontend: `components/NotificationBell.jsx` (header bell, red badge, framer
  slide-in panel) + `components/SettleUpModal.jsx` (confirm modal → POST
  settlement). Settle Up buttons also on GroupDetail's suggested-settlement rows
  (viewer's legs) and on the **MemberStats** page (pairwise leg vs the viewer).

### Fix 5 — Tick-based member selection for splits
- Both `pages/GroupDetail.jsx` and `components/AddExpenseWizard.jsx`: each member
  row has a checkbox (all ticked by default). Only ticked members are sent to the
  API (and thus to `splitService.calculateSplits`). Live counters (percentage
  remaining / exact unassigned) count ticked members only; submit is disabled
  until valid and at least one member is ticked. Works for all four split types.

### Fix 6 — Real-time with Pusher
- Backend: `npm install pusher`; `services/pusherService.js` initializes from
  `PUSHER_APP_ID/KEY/SECRET/CLUSTER` and exports `triggerEvent(channel, event,
  data)` + channel helpers. **Safe no-op when unconfigured** (dev/tests/serverless
  without creds still work). Triggers: `expense-added` (on create),
  `expense-settled` (on settlement), `invitation-received` (on invite).
- Frontend: `npm install pusher-js`; `lib/pusherClient.js` (public
  `VITE_PUSHER_KEY`/`VITE_PUSHER_CLUSTER` only — secret never shipped) +
  `hooks/usePusher.js`. GroupDetail subscribes to `group-<id>` and **prepends**
  new expenses live (+ refreshes balances); NotificationBell subscribes to
  `user-<id>` and bumps the badge on `invitation-received`.

### Prisma 7 note
- Prisma 7 does not allow `url` in the `datasource` block; the migrate URL comes
  from the existing `prisma.config.ts` (`process.env.DATABASE_URL`). Datasource
  block left url-less; runtime still uses the pg driver adapter.

### Verified
- `prisma validate` clean; `prisma generate` OK; **both migrations applied** to
  the Neon DB via `prisma migrate deploy`. Backend **20/20 unit tests pass**;
  `app.js` imports/boots cleanly (Pusher optional). Frontend `npm run build`
  succeeds (3122 modules; `_redirects` emitted into `dist/`).
- Not run here: full integration suite (needs a test DB); live Pusher broadcast
  (no creds set) — code paths are no-op-safe without them.

---

## Phase 7 — Vercel serverless adaptation (NEW; no logic/route/DB changes)

Backend is being deployed as a **Vercel serverless function**, which cannot run
background jobs. Two minimal changes were made — no routes, middleware, business
logic, or database code was touched:

- **`backend/src/index.js`** — removed the `node-cron` import and the hourly
  `cron.schedule('0 * * * *', …)` call. The startup `refreshRates('startup refresh')`
  is kept. Exchange-rate refresh is now triggered **manually** via the existing
  `POST /rates/sync` endpoint (`syncRatesNow`) instead of the cron.
- **`backend/src/app.js`** — added `export default app` (a `createApp()` instance) at
  the end so Vercel can use the Express app as the serverless handler. `createApp()`
  is unchanged and still used by `index.js`.

Verified: both files pass `node --check`.

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
