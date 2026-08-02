# NEXT — Phase 7: Deployment

Security hardening (Phase 6) is done. The final phase is deploying the app.

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
- **Debt settlement** endpoint + UI; **PATCH expense** PERCENTAGE/WEIGHT support;
  **winston** logger to replace `console.*`; user-facing **README.md** (clone-and-run).
- `getBalances` SQL aggregate optimization for large groups.

## Constraints (unchanged — CLAUDE.md)
- UUIDs; integer-cents money; JWT only in httpOnly cookies; secrets server-side only;
  parameterized Prisma/$queryRaw; `{ data, error, status }` envelope; async/await.
