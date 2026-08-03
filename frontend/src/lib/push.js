import { api } from '../api/client.js';

// Browser Web Push helpers. Everything degrades gracefully: if the browser
// lacks support, or no VAPID key is configured, these become safe no-ops so the
// rest of the app is unaffected.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

// VAPID keys are base64url; the PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

let registration = null;

async function ensureServiceWorker() {
  if (registration) return registration;
  registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

// Subscribe the current browser to push and persist the subscription on the
// backend for the logged-in user. Returns true on success. Assumes permission
// has already been granted (or grants it if `requestPermission` is true).
export async function subscribeToPush({ requestPermission = false } = {}) {
  if (!pushSupported || !pushConfigured()) return false;

  if (requestPermission && Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return false;
  }
  if (Notification.permission !== 'granted') return false;

  try {
    const reg = await ensureServiceWorker();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    // Send the browser-native subscription (endpoint + keys) to the backend.
    await api.subscribePush(subscription.toJSON());
    return true;
  } catch (err) {
    console.error('[push] subscribe failed:', err.message);
    return false;
  }
}

// Ask for permission (used by the Enable button on the banner) and subscribe.
export async function requestAndSubscribe() {
  if (!pushSupported || !pushConfigured()) return false;
  const result = await Notification.requestPermission();
  if (result !== 'granted') return false;
  return subscribeToPush();
}
