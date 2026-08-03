import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import {
  pushSupported,
  pushConfigured,
  subscribeToPush,
  requestAndSubscribe,
} from '../lib/push.js';

const DISMISS_KEY = 'heetwise:push-banner-dismissed';

// Dismissable top banner prompting the user to enable browser notifications.
// Shown once after login when permission hasn't been decided and the user
// hasn't dismissed it before (persisted in localStorage). If permission is
// already granted we silently (re)subscribe so it survives across sessions.
export default function NotificationPermissionBanner() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !pushSupported || !pushConfigured()) {
      setVisible(false);
      return;
    }
    // Already granted: keep the subscription fresh, no banner.
    if (Notification.permission === 'granted') {
      subscribeToPush();
      setVisible(false);
      return;
    }
    // Denied or previously dismissed: stay quiet.
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    setVisible(Notification.permission === 'default' && !dismissed);
  }, [user]);

  if (!visible) return null;

  async function handleEnable() {
    const ok = await requestAndSubscribe();
    if (ok) {
      toast.success('Notifications enabled');
    } else {
      toast('Notifications were not enabled');
    }
    // Whatever the outcome, don't keep nagging this session.
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-sm md:pl-64">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
        <Bell size={18} />
      </div>
      <p className="min-w-0 flex-1 text-sm text-fg">
        Enable notifications to get reminded about unsettled expenses.
      </p>
      <button
        onClick={handleEnable}
        className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600"
      >
        Enable
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <X size={18} />
      </button>
    </div>
  );
}
