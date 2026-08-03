import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, formatCents } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePusher } from '../hooks/usePusher.js';
import SettleUpModal from './SettleUpModal.jsx';

// Header notification bell: red badge with the unread count, a slide-in panel
// of "unsettled debt" notifications, and a Settle Up action per item. Also
// listens on the current user's Pusher channel so a new invitation bumps the
// badge in real time.
export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [liveBump, setLiveBump] = useState(0); // from invitation-received events
  const [intent, setIntent] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.getNotifications();
      setNotifications(d.notifications || []);
    } catch {
      /* silent — the bell is non-critical UI */
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Real-time: a received invitation increments the badge count.
  usePusher(user ? `user-${user.id}` : null, {
    'invitation-received': () => {
      setLiveBump((b) => b + 1);
      toast('📨 New group invitation — check Requests');
    },
  });

  const count = notifications.length + liveBump;

  function openPanel() {
    setOpen(true);
    setLiveBump(0); // opening clears the transient bump; refresh real data
    load();
  }

  function openSettle(n) {
    const you = { id: user.id, name: 'You' };
    const other = { id: n.otherPersonId, name: n.otherPersonName };
    const from = n.direction === 'you_owe' ? you : other;
    const to = n.direction === 'you_owe' ? other : you;
    setIntent({
      groupId: n.groupId,
      groupName: n.groupName,
      fromUserId: from.id,
      fromName: from.name,
      toUserId: to.id,
      toName: to.name,
      amountCents: n.amountCents,
    });
  }

  return (
    <>
      <button
        onClick={openPanel}
        aria-label="Notifications"
        className="fixed right-5 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors hover:text-fg"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,380px)] flex-col border-l border-border bg-surface shadow-2xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold">Notifications</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-fg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted">
                    You&apos;re all caught up — no unsettled debts older than 7
                    days.
                  </p>
                ) : (
                  notifications.map((n, i) => {
                    const youOwe = n.direction === 'you_owe';
                    return (
                      <div
                        key={`${n.groupId}-${n.otherPersonId}-${i}`}
                        className="rounded-xl border border-border bg-bg p-4"
                      >
                        <div className="text-sm">
                          {youOwe ? (
                            <>
                              You owe{' '}
                              <strong>{n.otherPersonName}</strong>
                            </>
                          ) : (
                            <>
                              <strong>{n.otherPersonName}</strong> owes you
                            </>
                          )}
                        </div>
                        <div
                          className={
                            'mt-1 text-lg font-bold ' +
                            (youOwe ? 'text-danger' : 'text-success')
                          }
                        >
                          {formatCents(n.amountCents)}
                        </div>
                        <div className="text-xs text-muted">
                          in {n.groupName} · outstanding &gt; 7 days
                        </div>
                        <button
                          onClick={() => openSettle(n)}
                          className="mt-3 w-full rounded-lg bg-brand-500 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                        >
                          Settle Up
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <SettleUpModal
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => load()}
      />
    </>
  );
}
