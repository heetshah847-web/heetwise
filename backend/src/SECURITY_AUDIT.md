<!--
SECURITY AUDIT — route protection matrix.

MISSING-PROTECTION SUMMARY (top, per spec):
  No protected route is missing auth. The only routes without JWT auth are
  intentionally public: GET /health, POST /auth/register, POST /auth/login,
  POST /auth/logout. Everything else requires the JWT cookie (requireAuth), and
  every group-scoped MUTATION additionally enforces membership (403) and, for
  expense mutations, ownership (403). No gaps found.
-->

# Security audit

Last reviewed: phase 6 (security hardening). Every route below was read and confirmed.

## Auth (`/auth`, all rate-limited: 10 req / 15 min / IP via `authRateLimiter`)
| Route | Protection |
|---|---|
| POST `/auth/register` | rate limit · `registerValidators` + `handleValidationErrors` · bcrypt salt rounds = 12 · **public by design** |
| POST `/auth/login` | rate limit · `loginValidators` + `handleValidationErrors` · generic error (no user enumeration) · **public by design** |
| POST `/auth/logout` | rate limit · clears cookie · **public by design** |
| GET `/auth/me` | rate limit · `requireAuth` |

## Top-level
| Route | Protection |
|---|---|
| GET `/health` | **public by design** (liveness probe) |
| GET `/me` | `requireAuth` |
| GET `/currencies` | `requireAuth` |
| GET `/rates` | `requireAuth` |
| POST `/rates/sync` | `requireAuth` |

## Groups (`/groups`, all `requireAuth`)
| Route | Protection | Non-member |
|---|---|---|
| POST `/groups` | `groupCreateValidators` + `handleValidationErrors` | n/a (creating) |
| GET `/groups` | returns only the caller's groups | n/a |
| GET `/groups/:groupId` | controller `assertMembership` | **404** (read) |
| PATCH `/groups/:groupId` | `requireGroupMember` + controller | **403** (mutation) |
| DELETE `/groups/:groupId` | `requireGroupMember` + creator-only check (403) | **403** |
| POST `/groups/:groupId/members` | `requireGroupMember` | **403** |
| GET `/groups/:groupId/balances` | controller `assertMembership` | **404** (read) |
| POST `/groups/:groupId/expenses` | `requireGroupMember` · `expenseCreateValidators` + `handleValidationErrors` · `validateSplit` | **403** |
| GET `/groups/:groupId/expenses` | controller `assertMembership` | **404** (read) |
| GET `/groups/:groupId/expenses/:expenseId` | controller `assertMembership` | **404** (read) |
| PATCH `/groups/:groupId/expenses/:expenseId` | `requireGroupMember` · `requireExpenseOwnership` (payer or creator) | **403** |
| DELETE `/groups/:groupId/expenses/:expenseId` | `requireGroupMember` · `requireExpenseOwnership` (payer or creator) | **403** |

> Per the owner's decision: **403 on mutations, 404 on reads** for non-member access.

## Stats (`/stats`, all `requireAuth`)
| Route | Protection |
|---|---|
| GET `/stats/me` | `requireAuth` (personal data only) |
| GET `/stats/groups/:groupId` | `requireGroupMember` (403) |
| GET `/stats/groups/:groupId/members/:memberId` | `requireGroupMember` + self-or-creator check (403) |

## App-wide layers
- **helmet()** — first middleware (X-Frame-Options, X-Content-Type-Options, HSTS,
  X-XSS-Protection, CSP, …).
- **CORS** locked to `FRONTEND_URL` (no-Origin requests allowed for tools/tests;
  other browser origins → 403).
- **JWT middleware** verifies the token AND that the user still exists in the DB
  (deleted users get 401).
- **Global error handler** — redacts `EXCHANGE_RATE_API_KEY` and `JWT_SECRET` from
  logs/responses, logs with a timestamp, never returns stack traces; generic 500 in
  production.

## Reconciliations / notes (spec vs. actual code)
- **csurf**: listed in the dependency sentence but omitted from the actual
  `npm install` command and never wired by any step; also deprecated/unmaintained.
  **Not installed.** CSRF is mitigated by httpOnly + SameSite cookies + single-origin
  CORS. Revisit if a token-based CSRF scheme is desired.
- **Route paths**: the spec assumed `/groups/:id/stats[...]` and a standalone
  `GET /groups/:id/members` and a `PUT` expense update. Actual app: stats live under
  `/stats/...`, members are returned inside `GET /groups/:id`, and expense update is
  `PATCH`. Protections were applied to the **actual** routes (routing unchanged).
- **Already present (kept, not duplicated)**: JWT user-exists check (401), bcrypt
  rounds = 12, `requireGroupMember` (403), member-stats self/creator authorization,
  API-key redaction, and the 10/15-min auth limiter covering login + register.
