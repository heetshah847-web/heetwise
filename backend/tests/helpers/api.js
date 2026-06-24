import request from 'supertest';

// Create a supertest agent (persists the auth cookie across requests) and
// register a fresh user on it. Returns { agent, user }.
export async function registerAgent(
  app,
  email,
  password = 'password123',
  name
) {
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/register')
    .send({ email, password, name });
  if (res.status !== 201) {
    throw new Error(`registerAgent failed (${res.status}): ${res.text}`);
  }
  return { agent, user: res.body.data.user };
}
