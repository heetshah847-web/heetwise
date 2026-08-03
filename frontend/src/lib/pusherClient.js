import Pusher from 'pusher-js';

// Client-safe Pusher setup. Only the PUBLIC key + cluster are used here — the
// server secret never reaches the browser. If the env vars are missing, the
// app runs without live updates (data still loads on navigation / refresh).
const KEY = import.meta.env.VITE_PUSHER_KEY;
const CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let client = null;

// Returns a shared Pusher client, or null when not configured. Never throws.
// Channels are PRIVATE, so pusher-js authorizes each subscription against the
// backend's /pusher/auth endpoint (which checks membership/identity). We use a
// custom handler so the auth request carries the httpOnly JWT cookie
// (credentials: 'include') across origins.
export function getPusher() {
  if (!KEY || !CLUSTER) return null;
  if (!client) {
    client = new Pusher(KEY, {
      cluster: CLUSTER,
      channelAuthorization: {
        endpoint: `${API_URL}/pusher/auth`,
        transport: 'ajax',
        async customHandler({ socketId, channelName }, callback) {
          try {
            const res = await fetch(`${API_URL}/pusher/auth`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                socket_id: socketId,
                channel_name: channelName,
              }),
            });
            if (!res.ok) {
              callback(new Error(`Pusher auth failed (${res.status})`), null);
              return;
            }
            const data = await res.json();
            callback(null, data);
          } catch (err) {
            callback(err, null);
          }
        },
      },
    });
  }
  return client;
}

// Reference-counted subscriptions. Several components subscribe to the same
// channel (e.g. private-user-<id> is used by the bell, requests, and summary).
// Unsubscribing on unmount must only tear the channel down when the LAST
// subscriber leaves, otherwise one component unmounting would silence the others.
const refCounts = new Map();

export function subscribeChannel(name) {
  const pusher = getPusher();
  if (!pusher) return null;
  refCounts.set(name, (refCounts.get(name) || 0) + 1);
  return pusher.subscribe(name);
}

export function unsubscribeChannel(name) {
  const pusher = getPusher();
  if (!pusher) return;
  const next = (refCounts.get(name) || 1) - 1;
  if (next <= 0) {
    refCounts.delete(name);
    pusher.unsubscribe(name);
  } else {
    refCounts.set(name, next);
  }
}

export const pusherConfigured = Boolean(KEY && CLUSTER);
