import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePusher } from '../hooks/usePusher.js';

// "Requests" tab: pending group invitations addressed to the current user,
// each with the group name/description, who invited them, and Accept/Decline.
export default function Requests() {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.getPendingInvitations();
      setInvitations(d.invitations || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh the list live when a new invitation arrives.
  usePusher(user ? `private-user-${user.id}` : null, {
    'invitation-received': () => load(),
  });

  async function accept(id) {
    setBusyId(id);
    try {
      await api.acceptInvitation(id);
      toast.success('Joined the group');
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function decline(id) {
    setBusyId(id);
    try {
      await api.declineInvitation(id);
      toast('Invitation declined');
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <h1 className="text-2xl font-bold">Requests</h1>
      <p className="mt-1 text-sm text-muted">
        Group invitations waiting for your response.
      </p>

      {loading ? (
        <p className="mt-8 text-muted">Loading…</p>
      ) : invitations.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
          <Users size={28} className="text-muted" />
          <p className="text-sm text-muted">No pending invitations.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{inv.groupName}</div>
                  {inv.groupDescription && (
                    <p className="mt-0.5 text-sm text-muted">
                      {inv.groupDescription}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted">
                    Owner:{' '}
                    <span className="text-fg">{inv.ownerName || '—'}</span>
                  </p>
                  <p className="text-sm text-muted">
                    Invited by:{' '}
                    <span className="text-fg">
                      {inv.invitedByName || inv.invitedBy?.email || '—'}
                    </span>
                  </p>
                  {inv.expiresAt && (
                    <p className="mt-1 text-xs text-muted">
                      Expires{' '}
                      {formatDistanceToNow(new Date(inv.expiresAt), {
                        addSuffix: true,
                      })}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  disabled={busyId === inv.id}
                  onClick={() => accept(inv.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  <Check size={16} /> Accept
                </button>
                <button
                  disabled={busyId === inv.id}
                  onClick={() => decline(inv.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  <X size={16} /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
