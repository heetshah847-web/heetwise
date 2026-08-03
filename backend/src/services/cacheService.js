import NodeCache from 'node-cache';

// In-memory cache for expensive stats aggregations. Default TTL: 300s (5 min).
const DEFAULT_TTL = 300;
const cache = new NodeCache({ stdTTL: DEFAULT_TTL, checkperiod: 120 });

export function get(key) {
  return cache.get(key);
}

export function set(key, value, ttl = DEFAULT_TTL) {
  return cache.set(key, value, ttl);
}

export function del(key) {
  return cache.del(key);
}

// Invalidate every cached stats entry for a group. Stats keys embed
// `:group:<groupId>`, so a new expense or a settlement in that group can wipe
// them all (across every requesting user) and force a fresh calculation.
export function invalidateGroupStats(groupId) {
  const keys = cache.keys().filter((k) => k.includes(`:group:${groupId}`));
  if (keys.length) cache.del(keys);
  return keys.length;
}

// Drop the cached cross-group balance summary for each given user. Called
// whenever an expense or settlement changes what a user is owed / owes so the
// Summary page never shows stale balances.
export function invalidateSummaries(userIds) {
  for (const id of userIds) cache.del(`summary:user:${id}`);
}
