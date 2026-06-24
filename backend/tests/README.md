# Tests

Run with `npm test` (all) or `npm run test:unit` (pure math only, no DB).

## Unit tests (`tests/unit/`)
No database required. Cover the pure split + balance math:
`computeEqualSplits`, `buildExactSplits`, `computeBalances`, `simplifyDebts`.

## Integration tests (`tests/integration/`)
`auth.test.js` and `groups.test.js` hit the real Express app via supertest and
require a **dedicated test database** — they `TRUNCATE` all tables between
cases, so never point them at your dev/prod DB.

Setup:
1. Create an empty Postgres database, e.g. `heetwise_test`.
2. Copy `.env.test.example` → `.env.test` and set `DATABASE_URL` to it.
3. Apply the schema once: `DATABASE_URL=... npx prisma migrate deploy`
   (or `npx prisma db push`).
4. `npm test`.

`rateLimit.test.js` needs no DB — it mounts a tiny app with a 2-request budget
and asserts the 3rd request returns 429. The main app's limiter stays at the
spec default (10 / 15 min); `.env.test` widens it to 1000 so the auth suite
doesn't trip it.
