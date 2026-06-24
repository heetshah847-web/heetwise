Stack: Node.js + Express backend, React frontend, PostgreSQL, Prisma ORM.
Rules:
- All IDs are UUIDs, never integers
- JWT stored in httpOnly cookies only, never localStorage
- All env variables in .env, never hardcoded, never in client bundle
- Every DB query must be parameterized, no string concatenation
- All endpoints return consistent JSON: { data, error, status }
- Use async/await throughout, no callbacks
- After every phase, update STATUS.md and NEXT.md thoroughly