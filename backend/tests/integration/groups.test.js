import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createApp } from '../../src/app.js';
import { resetDb, disconnectDb } from '../helpers/db.js';
import { registerAgent } from '../helpers/api.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

// Helper: create a group owned by `agent` and return its id.
async function createGroup(agent, name = 'Trip') {
  const res = await agent.post('/groups').send({ name });
  expect(res.status).toBe(201);
  return res.body.data.group.id;
}

describe('groups + expenses', () => {
  it('creates a group with the creator as a member', async () => {
    const { agent, user } = await registerAgent(app, 'owner@example.com');
    const res = await agent.post('/groups').send({ name: 'Roadtrip' });
    expect(res.status).toBe(201);
    expect(res.body.data.group.members.map((m) => m.id)).toContain(user.id);
  });

  it('computes equal-split balances and a settlement', async () => {
    const { agent: a, user: ua } = await registerAgent(app, 'a@example.com');
    const { user: ub } = await registerAgent(app, 'b@example.com');
    const groupId = await createGroup(a);
    await a.post(`/groups/${groupId}/members`).send({ email: 'b@example.com' });

    // A pays 1000 cents, split equally between A and B.
    const exp = await a.post(`/groups/${groupId}/expenses`).send({
      description: 'Dinner',
      amountCents: 1000,
      splitType: 'EQUAL',
      participantIds: [ua.id, ub.id],
    });
    expect(exp.status).toBe(201);

    const res = await a.get(`/groups/${groupId}/balances`);
    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(
      res.body.data.balances.map((b) => [b.user.id, b.netCents])
    );
    expect(byUser[ua.id]).toBe(500);
    expect(byUser[ub.id]).toBe(-500);

    // One settlement: B pays A 500.
    expect(res.body.data.settlements).toHaveLength(1);
    expect(res.body.data.settlements[0]).toMatchObject({ amountCents: 500 });
    expect(res.body.data.settlements[0].from.id).toBe(ub.id);
    expect(res.body.data.settlements[0].to.id).toBe(ua.id);
  });

  it('hides groups from non-members (404, not 403)', async () => {
    const { agent: a } = await registerAgent(app, 'a2@example.com');
    const { agent: b } = await registerAgent(app, 'b2@example.com');
    const groupId = await createGroup(a, 'Private');

    expect((await b.get(`/groups/${groupId}`)).status).toBe(404);
    expect((await b.get(`/groups/${groupId}/expenses`)).status).toBe(404);
    expect((await b.get(`/groups/${groupId}/balances`)).status).toBe(404);
  });

  it('blocks non-members from mutating a group (404)', async () => {
    const { agent: a, user: ua } = await registerAgent(app, 'a3@example.com');
    const { agent: b } = await registerAgent(app, 'b3@example.com');
    const groupId = await createGroup(a);

    const addRes = await b
      .post(`/groups/${groupId}/members`)
      .send({ email: 'b3@example.com' });
    expect(addRes.status).toBe(404);

    const expRes = await b.post(`/groups/${groupId}/expenses`).send({
      description: 'Sneaky',
      amountCents: 500,
      participantIds: [ua.id],
    });
    expect(expRes.status).toBe(404);
  });

  it('only lists groups the user belongs to', async () => {
    const { agent: a } = await registerAgent(app, 'a4@example.com');
    const { agent: b } = await registerAgent(app, 'b4@example.com');
    await createGroup(a, 'A-group');

    const aList = await a.get('/groups');
    const bList = await b.get('/groups');
    expect(aList.body.data.groups).toHaveLength(1);
    expect(bList.body.data.groups).toHaveLength(0);
  });

  it('rejects exact splits that do not sum to the total (400)', async () => {
    const { agent: a, user: ua } = await registerAgent(app, 'a5@example.com');
    const groupId = await createGroup(a);
    const res = await a.post(`/groups/${groupId}/expenses`).send({
      description: 'Bad',
      amountCents: 1000,
      splitType: 'EXACT',
      splits: [{ userId: ua.id, amountCents: 900 }],
    });
    expect(res.status).toBe(400);
  });

  it('paginates the expense list with limit + cursor', async () => {
    const { agent: a, user: ua } = await registerAgent(app, 'a6@example.com');
    const groupId = await createGroup(a);

    // Create 5 expenses.
    for (let i = 0; i < 5; i += 1) {
      const r = await a.post(`/groups/${groupId}/expenses`).send({
        description: `Expense ${i}`,
        amountCents: 100,
        participantIds: [ua.id],
      });
      expect(r.status).toBe(201);
    }

    const page1 = await a.get(`/groups/${groupId}/expenses?limit=2`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.expenses).toHaveLength(2);
    expect(page1.body.data.hasMore).toBe(true);
    expect(page1.body.data.nextCursor).toBeTruthy();

    const page2 = await a.get(
      `/groups/${groupId}/expenses?limit=2&cursor=${page1.body.data.nextCursor}`
    );
    expect(page2.body.data.expenses).toHaveLength(2);

    // No id overlap between pages.
    const ids1 = page1.body.data.expenses.map((e) => e.id);
    const ids2 = page2.body.data.expenses.map((e) => e.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it('rejects an invalid pagination cursor (400)', async () => {
    const { agent: a } = await registerAgent(app, 'a7@example.com');
    const groupId = await createGroup(a);
    const res = await a.get(`/groups/${groupId}/expenses?cursor=not-a-uuid`);
    expect(res.status).toBe(400);
  });
});
