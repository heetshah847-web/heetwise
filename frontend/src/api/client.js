// Thin fetch wrapper. Always sends credentials so the httpOnly JWT cookie
// rides along — the token is never read from or stored in JS/localStorage.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Backend always returns { data, error, status }.
  const payload = await res.json().catch(() => ({
    data: null,
    error: 'Unexpected server response',
    status: res.status,
  }));

  if (!res.ok || payload.error) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return payload.data;
}

export const api = {
  register: (email, password, name) =>
    request('/auth/register', { method: 'POST', body: { email, password, name } }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
};
