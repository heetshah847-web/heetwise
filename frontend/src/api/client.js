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

  // Currencies / rates (display only)
  listCurrencies: () => request('/currencies'),
  getRates: () => request('/rates'),
  syncRates: () => request('/rates/sync', { method: 'POST' }),

  // Statistics
  getGroupStats: (groupId) => request(`/stats/groups/${groupId}`),
  getMemberStats: (groupId, memberId) =>
    request(`/stats/groups/${groupId}/members/${memberId}`),
  getMyStats: () => request('/stats/me'),

  // Groups
  listGroups: () => request('/groups'),
  createGroup: (name, description) =>
    request('/groups', { method: 'POST', body: { name, description } }),
  getGroup: (groupId) => request(`/groups/${groupId}`),
  // Adding a member now sends an INVITATION (the user joins after accepting).
  addMember: (groupId, email) =>
    request(`/groups/${groupId}/invitations`, { method: 'POST', body: { email } }),
  inviteToGroup: (groupId, email) =>
    request(`/groups/${groupId}/invitations`, { method: 'POST', body: { email } }),
  getBalances: (groupId) => request(`/groups/${groupId}/balances`),
  createSettlement: (groupId, { fromUserId, toUserId, amountCents, currency }) =>
    request(`/groups/${groupId}/settlements`, {
      method: 'POST',
      body: { fromUserId, toUserId, amountCents, currency },
    }),

  // Invitations (invitee-facing)
  getPendingInvitations: () => request('/invitations/pending'),
  acceptInvitation: (invitationId) =>
    request(`/invitations/${invitationId}/accept`, { method: 'POST' }),
  declineInvitation: (invitationId) =>
    request(`/invitations/${invitationId}/decline`, { method: 'POST' }),

  // Notifications (unsettled debts older than 7 days)
  getNotifications: () => request('/notifications'),

  // Expenses
  listExpenses: (groupId, { cursor, limit } = {}) => {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request(`/groups/${groupId}/expenses${suffix}`);
  },
  createExpense: (groupId, expense) =>
    request(`/groups/${groupId}/expenses`, { method: 'POST', body: expense }),
  deleteExpense: (groupId, expenseId) =>
    request(`/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' }),
};

// Money helpers: the API speaks integer cents; the UI speaks dollars.
export const toCents = (dollars) => Math.round(Number(dollars) * 100);
export const formatCents = (cents) =>
  `$${(cents / 100).toFixed(2)}`;
