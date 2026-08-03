import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, formatCents } from '../api/client.js';
import Button from './Button.jsx';

// Confirmation modal for settling up with another person. It marks ALL debts
// between the two users (across the listed groups) as settled.
//
// `intent` is null when closed, otherwise:
//   {
//     currentUserId,
//     otherUserId, otherName, otherEmail,
//     direction: 'owes_you' | 'you_owe',
//     amountCents,                              // total being settled
//     groups: [{ groupId, groupName, amountCents }],
//   }
export default function SettleUpModal({ intent, onClose, onSettled }) {
  const [submitting, setSubmitting] = useState(false);
  const open = Boolean(intent);

  const name = intent?.otherName || intent?.otherEmail || 'them';
  const avatarInitial = (intent?.otherName || intent?.otherEmail || '?')
    .charAt(0)
    .toUpperCase();
  const youOwe = intent?.direction === 'you_owe';
  const groups = intent?.groups ?? [];

  async function confirm() {
    if (!intent || submitting) return; // guard against double-click
    setSubmitting(true);
    try {
      // One settlement per contributing group. Direction sets payer/payee:
      //   they owe me → they paid me (from = other, to = me)
      //   I owe them  → I paid them  (from = me,    to = other)
      for (const g of groups) {
        if (!g.amountCents) continue;
        await api.createSettlement(g.groupId, {
          fromUserId: youOwe ? intent.currentUserId : intent.otherUserId,
          toUserId: youOwe ? intent.otherUserId : intent.currentUserId,
          amountCents: g.amountCents,
          currency: 'USD',
        });
      }
      toast.success(`Settled up with ${name} successfully`);
      onSettled?.(intent);
      onClose?.();
    } catch (err) {
      // Keep the modal open so the user can retry; show the exact error.
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !submitting && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 text-fg shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">Settle up</Dialog.Title>

          {intent && (
            <>
              {/* Person: avatar + name */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-lg font-semibold text-brand-400">
                  {avatarInitial}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-fg">{name}</div>
                  {intent.otherEmail && (
                    <div className="truncate text-xs text-muted">
                      {intent.otherEmail}
                    </div>
                  )}
                </div>
                <div className="ml-auto text-right">
                  <div
                    className={
                      'text-2xl font-bold ' +
                      (youOwe ? 'text-danger' : 'text-success')
                    }
                  >
                    {formatCents(intent.amountCents)}
                  </div>
                  {/* Balances are stored in USD; show the USD equivalent too. */}
                  <div className="text-xs text-muted">
                    ${(intent.amountCents / 100).toFixed(2)} USD
                  </div>
                </div>
              </div>

              {/* Which groups are being settled */}
              <div className="mt-5 rounded-xl border border-border bg-bg p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {groups.length === 1
                    ? 'Settling in 1 group'
                    : `Settling across ${groups.length} groups`}
                </div>
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <div
                      key={g.groupId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate text-muted">{g.groupName}</span>
                      <span className="font-medium text-fg">
                        {formatCents(g.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-sm text-muted">
                This will mark all debts between you and{' '}
                <strong className="text-fg">{name}</strong> as settled.
              </p>

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <button
                  onClick={confirm}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {submitting ? 'Settling…' : 'Confirm Settlement'}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
