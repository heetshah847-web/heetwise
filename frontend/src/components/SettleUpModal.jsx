import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import { api, formatCents } from '../api/client.js';
import Button from './Button.jsx';

// Confirmation modal for recording a settlement (payment) between two people.
// `intent` is null when closed, otherwise:
//   { groupId, groupName, fromUserId, fromName, toUserId, toName, amountCents }
export default function SettleUpModal({ intent, onClose, onSettled }) {
  const [submitting, setSubmitting] = useState(false);
  const open = Boolean(intent);

  async function confirm() {
    if (!intent) return;
    setSubmitting(true);
    try {
      await api.createSettlement(intent.groupId, {
        fromUserId: intent.fromUserId,
        toUserId: intent.toUserId,
        amountCents: intent.amountCents,
        currency: 'USD',
      });
      toast.success('Settlement recorded');
      onSettled?.(intent);
      onClose?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 text-fg shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">Settle up</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {intent && (
              <>
                Record that <strong className="text-fg">{intent.fromName}</strong>{' '}
                paid <strong className="text-fg">{intent.toName}</strong>{' '}
                <strong className="text-fg">
                  {formatCents(intent.amountCents)}
                </strong>
                {intent.groupName ? (
                  <>
                    {' '}in <span className="text-fg">{intent.groupName}</span>
                  </>
                ) : null}
                . This is logged as a payment; it does not delete past expenses.
              </>
            )}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={submitting}>
              Confirm payment
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
