import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRateLimiter } from '../../src/middleware/rateLimit.js';

// No DB needed: mount a tiny app with a 2-request budget and confirm the
// 3rd request from the same IP is rejected with 429.
function makeApp() {
  const app = express();
  const limiter = createAuthRateLimiter({ max: 2, windowMs: 60_000 });
  app.post('/auth/login', limiter, (req, res) =>
    res.status(200).json({ data: { ok: true }, error: null, status: 200 })
  );
  return app;
}

describe('auth rate limiter', () => {
  it('allows up to the limit then returns 429', async () => {
    const app = makeApp();
    const a1 = await request(app).post('/auth/login');
    const a2 = await request(app).post('/auth/login');
    const a3 = await request(app).post('/auth/login');

    expect(a1.status).toBe(200);
    expect(a2.status).toBe(200);
    expect(a3.status).toBe(429);
    expect(a3.body.error).toMatch(/too many/i);
  });
});
