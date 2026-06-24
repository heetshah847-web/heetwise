import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb, disconnectDb } from '../helpers/db.js';
import { registerAgent } from '../helpers/api.js';

const app = createApp();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('auth', () => {
  it('registers a user, sets an httpOnly cookie, returns a UUID id', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ error: null, status: 201 });
    expect(res.body.data.user.id).toMatch(UUID_RE);

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/token=/);
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('rejects login with a wrong password (401)', async () => {
    await registerAgent(app, 'b@example.com', 'password123');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'b@example.com', password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects duplicate registration (409)', async () => {
    await registerAgent(app, 'c@example.com', 'password123');
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'c@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects /auth/me without a cookie (401)', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects /auth/me with an invalid cookie (401)', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', 'token=not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns the current user from /auth/me with a valid cookie', async () => {
    const { agent, user } = await registerAgent(app, 'd@example.com');
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('d@example.com');
    expect(res.body.data.user.id).toBe(user.id);
  });
});
