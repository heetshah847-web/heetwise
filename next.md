Phase 1 goal: scaffold the full project structure and implement auth.
Tasks:
- Initialize Node/Express backend with folder structure
- Initialize React frontend with React Router
- Set up Prisma with PostgreSQL, create User model with UUID
- Implement register and login endpoints with bcrypt password hashing
- JWT issued as httpOnly cookie on login
- Rate limiting middleware on /auth routes (max 10 req per 15 min per IP)
- Basic protected route middleware that reads JWT from cookie
- A test /me endpoint that returns current user from token
- .env.example file listing all required variables
After completion: update STATUS.md with what was built, update NEXT.md for phase 2.