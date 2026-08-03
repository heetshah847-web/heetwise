# NEXT — Deployment

Security hardening (Phase 6) is done. Phase 8 added invitations, settlements,
notifications, tick-based splits, multi-origin CORS, and Pusher real-time.
Phase 9 added the cross-group **Summary** page + `GET /balances/summary`.
Phase 10 made **Settle Up** work end-to-end (settlement tracking, history, live
cascade) and added **browser push notifications**. Deploy steps below; **the new
env vars + migrations + cron are the important part.**

## Phase 11 deploy checklist (hardening) — DO THESE FIRST

### 1. Apply the new migration (required — the code depends on its columns)
From `backend/` with `DATABASE_URL` set:
`npx prisma migrate deploy` — applies **`20260804120000_hardening`**
(`users.token_version`, `expenses.deleted_at`, `expenses.idempotency_key`). All
additive + backfilled; existing logins stay valid. `prisma generate` runs via
`postinstall`. **Deploy the backend only after this migration is applied**, or
expense/auth reads will error on the missing columns.

### 2. Backend env var (optional but recommended)
- `CRON_SECRET` — set it in the backend Vercel project so
  `/notifications/send-reminders` rejects anything without the matching bearer
  token. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  Leave unset to keep the endpoint open (unchanged behavior).

### 3. Pusher (unchanged env, new behavior)
Channels are now **private** and authorized at subscribe time via `POST /pusher/auth`.
No new env vars — the existing `PUSHER_*` (backend) / `VITE_PUSHER_*` (frontend)
still drive it, and it remains a safe no-op when unconfigured. If Pusher IS
configured, ensure the frontend origin is in the backend CORS allow-list
(`FRONTEND_URL`) so the credentialed auth request succeeds (it already must be).

### 4. Optional: keep the DB warm
`/health` now runs `SELECT 1`. Point any external uptime monitor at it every few
minutes to reduce Neon cold-start latency (Vercel Hobby crons only run daily, so
this is left to an external pinger rather than a cron).

## Phase 10 deploy checklist (Settle Up + push) — DO THESE

### Database migrations (run on every environment)
Two new migrations were added and already applied to Neon:
`20260803120000_add_settlement_tracking` (adds `splits.is_settled`) and
`20260803120100_add_push_subscriptions` (adds the `push_subscriptions` table).
On any other environment run, from `backend/` with `DATABASE_URL` set:
`npx prisma migrate deploy` (idempotent). **`prisma generate` must run** (it does
via `postinstall`) so the client knows `isSettled` / `pushSubscription`.

### Backend env vars (Vercel → backend project)
Add Web Push (VAPID) — generate once with `npx web-push generate-vapid-keys`:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`  ← **secret; backend only, never in the frontend project**
- `VAPID_EMAIL` (e.g. `mailto:admin@heetwise.app` or a bare email)

If these are omitted the API still runs — push simply becomes a no-op. New
dependency **`web-push`** is in `backend/package.json` (installed).

### Frontend env vars (Vercel → frontend project)
- `VITE_VAPID_PUBLIC_KEY` = the **same** value as backend `VAPID_PUBLIC_KEY`
  (client-safe). If unset, the app skips push subscription; everything else works.

### Cron (daily debt reminders)
`vercel.json` at the **repo root** (and `backend/vercel.json`) declares a cron:
`{ "path": "/notifications/send-reminders", "schedule": "30 3 * * *" }` =
**09:00 IST** daily. The cron must run on the **backend** deployment (that's where
the route lives); if the backend Vercel project is rooted at `backend/`, the
`backend/vercel.json` cron is the effective one. `/notifications/send-reminders`
is intentionally unauthenticated (returns `{ sent }`) so the platform cron can
reach it.

### Service worker
`frontend/public/sw.js` ships in the build output and is registered at runtime by
`lib/push.js` when the user enables notifications. No dashboard config needed.

### Notes / follow-ups
- Settlements are **full-settle per group**; a partial-settlement UI could be
  reintroduced later (the backend would need to mark splits proportionally).
- The unauthenticated `send-reminders` endpoint could be hardened with a
  `CRON_SECRET` header check if the deployment exposes it publicly.
- Group **stats** remain expense-derived (not settlement-adjusted); revisit if a
  "net of settlements" stat is ever desired.

## Phase 9 notes (no new env vars / migrations)
- `GET /balances/summary` and `pages/Summary.jsx` are additive — **no schema
  change, no migration, no new env var**. They reuse existing tables (expenses,
  splits, group_members) and the existing settlement endpoint. Nothing extra to
  configure on deploy.
- Possible follow-ups:
  - The Summary and the sidebar badge each fetch `/balances/summary`; consider a
    shared context/cache so a page + sidebar load don't double-fetch, and so
    settling up refreshes both without a route change.
  - Optionally make the Summary live via Pusher (`expense-added`/`expense-settled`)
    like GroupDetail, instead of manual Refresh.
  - The endpoint reduces in JS after one query; if groups grow very large, push the
    per-pair sum into a parameterized `$queryRaw` aggregate (same idea as the
    `getBalances` optimization already noted below).

## Phase 8 deploy checklist (do these on the live deploy)

### Backend env vars (Vercel → backend project → Settings → Environment Variables)
Add the Pusher server credentials from your Pusher Channels app dashboard:
- `PUSHER_APP_ID`
- `PUSHER_KEY`
- `PUSHER_SECRET`  ← **secret; backend only, never in the frontend project**
- `PUSHER_CLUSTER` (e.g. `mt1`, `us2`, `eu`, `ap2`)

If these four are omitted the API still runs — real-time broadcasts simply become
no-ops and clients see fresh data on their next fetch/navigation.

Also update CORS for the live frontend URL(s):
- `FRONTEND_URL` now accepts a **comma-separated list**, e.g.
  `FRONTEND_URL=https://heetwise.vercel.app,https://heetwise-wnkk.vercel.app`
  (add every domain/preview host that must be allowed).

### Frontend env vars (Vercel → frontend project → Settings → Environment Variables)
Client-safe Pusher values only (these ship in the bundle — never add the secret):
- `VITE_PUSHER_KEY` (the same public app key as `PUSHER_KEY`)
- `VITE_PUSHER_CLUSTER` (same cluster as the backend)
- (existing) `VITE_API_URL` = the backend HTTPS URL.

### Database migrations
Both Phase 8 migrations (`add_group_invitations`, `add_settlements`) were already
applied to the Neon database via `prisma migrate deploy`. On any fresh/other
environment run, from `backend/`, with `DATABASE_URL` set:
`npx prisma migrate deploy` (idempotent — it skips already-applied migrations).

### SPA routing
`frontend/vercel.json` (rewrites) + `frontend/public/_redirects` are committed, so
deep links / iOS refresh serve `index.html` instead of 404. No dashboard config
needed — Vercel picks up `vercel.json` automatically.

---

## Phase 7 context — Deployment

The final phase is deploying the app.

> **Plan update (Vercel serverless backend):** the backend is now being deployed as a
> **Vercel serverless function**, not a long-running Railway service. Serverless can't
> run background jobs, so `node-cron` was removed from `src/index.js` and the hourly
> exchange-rate refresh is now triggered **manually via `POST /rates/sync`**. `app.js`
> now has `export default app` for Vercel to use as the handler. **Consequences to wire
> up during deploy:** point Vercel at `backend/` with a serverless entry that uses the
> app's default export; keep `exchange_rates` fresh by hitting `POST /rates/sync` on a
> schedule (e.g. a Vercel Cron or external scheduler) instead of the in-process cron.
> The Railway steps below are superseded for the backend but kept for reference.

## Pre-flight (do these first)
1. `cd backend && npm install` and `cd frontend && npm install` (both verified to
   build locally; backend boots, frontend `npm run build` succeeds).
2. Locally: `npx prisma migrate dev` (no migrations exist yet — this creates the full
   schema), then `npm run sync-rates` once, then `npm test` against a test DB to
   confirm the integration suite is green (only unit tests have been run here).
3. Confirm `.gitignore` excludes `.env`, `node_modules`, `dist`, `.env.test`.

## 1. Push to GitHub
- `git init` (if needed), commit everything, create a GitHub repo, push.
- Double-check **no secrets are committed**: `.env` is gitignored; only `.env.example`
  (placeholders) is tracked. `EXCHANGE_RATE_API_KEY`, `JWT_SECRET`, the DB password
  must never appear in tracked files.

## 2. Backend + PostgreSQL on Railway
- New Railway project → **Add PostgreSQL** plugin. Railway provides a `DATABASE_URL`.
- **Add a service** from the GitHub repo, root = `backend/`.
- Build/start: install deps, run `npx prisma migrate deploy` on release (not
  `migrate dev`), start with `npm start`.
- **Environment variables** (Railway → Variables):
  - `DATABASE_URL` (reference the Postgres plugin's variable)
  - `JWT_SECRET` (a long random string — generate a new one, do NOT reuse the dev value)
  - `JWT_EXPIRES_IN=7d`
  - `EXCHANGE_RATE_API_KEY` (the real server-side key)
  - `NODE_ENV=production`
  - `PORT` (Railway sets one; the app reads `process.env.PORT`)
  - `FRONTEND_URL` = the Vercel URL (set after step 3; e.g. `https://heetwise.vercel.app`)
  - `CLIENT_ORIGIN` = same as FRONTEND_URL (kept as a fallback)
- After first deploy, run `npm run sync-rates` once (Railway one-off command / shell)
  so `exchange_rates` is populated; the hourly cron then keeps it fresh.
- Note: in production the JWT cookie is `secure` + `sameSite=none`, so the API must be
  served over **HTTPS** (Railway provides it) and the frontend must call it over HTTPS.

## 3. Frontend on Vercel
- Import the GitHub repo, root = `frontend/`. Framework preset: **Vite**.
  Build: `npm run build`, output: `dist`.
- **Environment variable**: `VITE_API_URL` = the Railway backend HTTPS URL
  (e.g. `https://heetwise-api.up.railway.app`). (Only `VITE_`-prefixed vars reach the
  client bundle; never put secrets here.)
- Deploy → note the resulting Vercel URL.

## 4. Wire CORS to the live URL
- Set Railway's `FRONTEND_URL` (and `CLIENT_ORIGIN`) to the exact Vercel URL
  (scheme + host, no trailing slash) and redeploy the backend.
- The CORS guard allows only that origin; everything else → 403.

## 5. Smoke test in production
- Register → login (confirm the auth cookie is set, HTTPS, httpOnly).
- Create a group, add a member, add a USD and a non-USD expense, view balances,
  open the stats pages and the Currencies page (Refresh).
- Confirm cross-origin requests from a random origin are blocked (403), and that
  error responses never include stack traces (NODE_ENV=production).

## Carried-over follow-ups (not blocking deploy)
- **bcrypt on Node 24** may fail to build on some hosts — if Railway's build breaks on
  bcrypt, switch to `bcryptjs` (pure JS, drop-in).
- **Debt settlement** endpoint + UI — DONE (Phase 8 endpoint; Phase 9 Summary UI).
  **PATCH expense** PERCENTAGE/WEIGHT support; **winston** logger to replace
  `console.*`; user-facing **README.md** (clone-and-run).
- `getBalances` SQL aggregate optimization for large groups.

## Constraints (unchanged — CLAUDE.md)
- UUIDs; integer-cents money; JWT only in httpOnly cookies; secrets server-side only;
  parameterized Prisma/$queryRaw; `{ data, error, status }` envelope; async/await.
