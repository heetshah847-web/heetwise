Phase: 1 (complete)

## Built

### Project structure
- `backend/` — Node.js + Express API (ES modules)
- `frontend/` — React + Vite + React Router SPA

### Backend (Node/Express)
- Express app factory in `src/app.js`, server entry + graceful shutdown in `src/index.js`
- Folder structure: `config/`, `lib/`, `middleware/`, `controllers/`, `routes/`, `utils/`
- Centralized env loading/validation in `src/config/env.js` (fails fast if DATABASE_URL or JWT_SECRET missing). Nothing hardcoded.
- CORS configured for the client origin with `credentials: true`; `cookie-parser` and JSON body parsing enabled.
- `/health` endpoint returning the standard envelope.

### Database (Prisma + PostgreSQL)
- Prisma configured with the `postgresql` provider in `prisma/schema.prisma`.
- `User` model: `id` is a UUID (`@db.Uuid`, `@default(uuid())`), unique `email`, `passwordHash`, optional `name`, `createdAt`/`updatedAt`. Maps to `users` table.
- Shared `PrismaClient` instance in `src/lib/prisma.js`. All queries go through Prisma (parameterized, no string concatenation).

### Auth
- `POST /auth/register` — validates email/password (min 8 chars), rejects duplicates (409), hashes password with bcrypt (12 salt rounds), creates user, issues JWT cookie. Returns 201.
- `POST /auth/login` — verifies credentials with `bcrypt.compare`, generic error message to avoid account enumeration, issues JWT cookie. Returns 200.
- `POST /auth/logout` — clears the auth cookie.
- `GET /auth/me` and top-level `GET /me` — protected; return the current user from the token.
- JWT signed with `JWT_SECRET`, carries user id as `sub`, expiry from `JWT_EXPIRES_IN` (default 7d). Helpers in `src/utils/jwt.js`.
- JWT delivered ONLY as an httpOnly cookie (`secure` + `sameSite=none` in production, `lax` in dev). Never localStorage, never in a response body.

### Middleware
- `requireAuth` (`src/middleware/auth.js`) — reads JWT from the httpOnly cookie, verifies it, loads the user from DB, attaches `req.user`. Returns 401 on any failure.
- `authRateLimiter` (`src/middleware/rateLimit.js`) — `express-rate-limit`, max 10 requests / 15 min / IP, applied to all `/auth` routes. Returns 429 in the standard envelope.
- `notFound` + `errorHandler` (`src/middleware/errorHandler.js`) — 404 and centralized 500 handling, both in the standard envelope; hides error details in production.

### API contract
- Every response uses `{ data, error, status }` via `sendSuccess` / `sendError` in `src/utils/response.js`.
- All handlers use async/await; no callbacks.

### Frontend (React + React Router)
- Vite + React 18, entry `src/main.jsx` wraps app in `BrowserRouter` + `AuthProvider`.
- `src/api/client.js` — fetch wrapper, always `credentials: 'include'` so the httpOnly cookie is sent; never touches localStorage.
- `AuthContext` — loads current user via `/auth/me` on mount; exposes `login`, `register`, `logout`, `user`, `loading`.
- `ProtectedRoute` — redirects unauthenticated users to `/login`.
- Pages: `Login`, `Register`, `Dashboard` (shows current user + logout). Routes wired in `src/App.jsx`.

### Config / env
- `backend/.env.example` — DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN, NODE_ENV.
- `frontend/.env.example` — VITE_API_URL (only VITE_-prefixed vars reach the client bundle; no secrets).
- `.gitignore` in both packages excludes `node_modules`, `.env`, build output.

## Not yet done (needs the developer)
- `npm install` in `backend/` and `frontend/` (no node_modules committed).
- Create real `.env` files from the `.env.example` templates.
- Run `npx prisma migrate dev --name init` to create the `users` table (requires a running PostgreSQL).
- Code has not been executed/tested at runtime yet — dependencies are not installed in this environment.

## Environment variables in use
Backend: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CLIENT_ORIGIN, NODE_ENV
Frontend: VITE_API_URL
