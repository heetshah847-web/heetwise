import Pusher from 'pusher';

// ─────────────────────────────────────────────────────────────────────────────
// pusherService — the ONLY file permitted to reference the Pusher server
// secret. Everything else calls triggerEvent(); the transport is an
// implementation detail here.
//
// The service is OPTIONAL: if the four PUSHER_* env vars are not all set, the
// Pusher instance is never created and triggerEvent becomes a safe no-op. This
// keeps local dev, tests, and any deploy without Pusher credentials working —
// clients still see fresh data on their next fetch/navigation.
// ─────────────────────────────────────────────────────────────────────────────

const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;

const isConfigured = Boolean(
  PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER
);

const pusher = isConfigured
  ? new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true,
    })
  : null;

// Broadcast an event to a channel. Never throws — a failed broadcast must never
// break the request that triggered it (the write has already succeeded). Any
// error is logged (the secret never appears in Pusher error messages).
export async function triggerEvent(channelName, eventName, data) {
  if (!pusher) return;
  try {
    await pusher.trigger(channelName, eventName, data);
  } catch (err) {
    console.error(
      `[pusher] failed to trigger "${eventName}" on "${channelName}": ${err.message}`
    );
  }
}

// Channel-name helpers so producers and consumers agree on the convention.
// These are PRIVATE channels: pusher-js must authenticate via /pusher/auth
// before it can subscribe, so a stranger who guesses a group/user id can no
// longer listen in (the server checks membership/identity first).
export const groupChannel = (groupId) => `private-group-${groupId}`;
export const userChannel = (userId) => `private-user-${userId}`;

// Sign a subscription for a private channel. Returns the auth payload pusher-js
// expects, or null when Pusher isn't configured (the caller then 403s).
export function authorizeChannel(socketId, channelName) {
  if (!pusher) return null;
  return pusher.authorizeChannel(socketId, channelName);
}

export const pusherConfigured = isConfigured;
