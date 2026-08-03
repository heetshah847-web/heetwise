import Pusher from 'pusher-js';

// Client-safe Pusher setup. Only the PUBLIC key + cluster are used here — the
// server secret never reaches the browser. If the env vars are missing, the
// app runs without live updates (data still loads on navigation / refresh).
const KEY = import.meta.env.VITE_PUSHER_KEY;
const CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;

let client = null;

// Returns a shared Pusher client, or null when not configured. Never throws.
export function getPusher() {
  if (!KEY || !CLUSTER) return null;
  if (!client) {
    client = new Pusher(KEY, { cluster: CLUSTER });
  }
  return client;
}

export const pusherConfigured = Boolean(KEY && CLUSTER);
