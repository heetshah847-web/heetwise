# Phase 2

## Context from Phase 1 (read this first)
Phase 1 scaffolded the whole project and shipped auth. You now have:
- `backend/` — Express (ES modules) with `config/ lib/ middleware/ controllers/ routes/ utils/`.
- `frontend/` — React + Vite + React Router with `AuthContext`, `ProtectedRoute`, and Login/Register/Dashboard pages.
- Prisma + PostgreSQL with a `User` model (UUID id, email, passwordHash, name).
- Working register/login/logout, JWT in an httpOnly cookie, `requireAuth` middleware, `/auth/me` + `/me`, and a 10-req/15-min rate limiter on `/auth`.
- Standard `{ data, error, status }` envelope via `sendSuccess` / `sendError`.

See STATUS.md for the full file-by-file breakdown.

## Before writing Phase 2 code (developer setup, one time)
These could not be done in the build environment and must happen before the app runs:
1. `cd backend && npm install`, then `cd frontend && npm install`.
2. Copy `backend/.env.example` → `backend/.env` and fill in `DATABASE_URL` + a strong `JWT_SECRET`.
3. Copy `frontend/.env.example` → `frontend/.env`.
4. Start PostgreSQL, then `cd backend && npx prisma migrate dev --name init` to create the `users` table.
5. Smoke test: run backend (`npm run dev`) and frontend (`npm run dev`); register a user, confirm the cookie is set and the Dashboard loads.

## Phase 2 goal: first core domain resource + ownership + tests
Introduce the app's first real data model behind auth, fully owned per-user, with complete CRUD and a real test suite. (Pick the concrete resource name with the product owner; this plan uses a generic `Item` — rename to the actual domain entity.)

### Tasks
1. **Prisma model** — add an `Item` model: UUID `id`, `title`, optional `description`, `userId` (UUID FK → `User.id`, `onDelete: Cascade`), `createdAt`/`updatedAt`. Add the relation field on `User`. Run a new migration (`prisma migrate dev --name add_item`).
2. **CRUD endpoints** under `/items`, all behind `requireAuth`, all scoped to `req.user.id`:
   - `POST /items` — create (validate title).
   - `GET /items` — list only the current user's items.
   - `GET /items/:id` — fetch one; 404 if not found OR not owned (don't leak existence).
   - `PATCH /items/:id` — update; ownership-checked.
   - `DELETE /items/:id` — delete; ownership-checked.
   - New `controllers/itemController.js` + `routes/itemRoutes.js`, mounted in `app.js`. Keep the `{ data, error, status }` envelope and async/await throughout.
3. **Validation** — add a small reusable validation helper in `utils/` (or adopt `zod`) rather than ad-hoc checks; return 400 with a clear message in the envelope.
4. **Frontend** — an `Items` page (protected): list, create (form), edit, delete, wired through `api/client.js` (extend it with item methods, still `credentials: 'include'`). Add a nav link from the Dashboard.
5. **Testing (new in phase 2)** — set up a test runner in `backend/` (Vitest or Jest + supertest). Cover: register/login happy path, rejecting bad credentials, the rate limiter, `requireAuth` rejecting missing/invalid cookies, and item ownership isolation (user A cannot read/modify user B's items). Add a `test` script to `backend/package.json`. Document how to point tests at a separate test database.

### Constraints (unchanged — from CLAUDE.md)
- All IDs are UUIDs, never integers.
- JWT only in httpOnly cookies, never localStorage.
- All env vars in `.env`, never hardcoded, never in the client bundle.
- Every DB query parameterized (Prisma handles this — no raw string concatenation).
- All endpoints return `{ data, error, status }`.
- async/await throughout, no callbacks.

### Watch out for
- Ownership checks must be enforced server-side on every `/items/:id` route — never trust an id from the client without confirming `userId === req.user.id`.
- Return 404 (not 403) for items owned by someone else, to avoid leaking which ids exist.
- Add an index on `Item.userId` for list performance.
- Keep the rate limiter scoped to `/auth`; do not apply it to `/items`.

## After completion
Update STATUS.md with what was built, and update NEXT.md for phase 3.
