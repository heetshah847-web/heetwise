import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Scale,
  RefreshCw,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  PartyPopper,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api, formatCents } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePusher } from '../hooks/usePusher.js';
import SettleUpModal from '../components/SettleUpModal.jsx';

const dollars = (cents) => (cents / 100).toFixed(2);
const initialOf = (person) =>
  (person.otherUserName || person.otherUserEmail || '?').charAt(0).toUpperCase();

// -- Person card -------------------------------------------------------------
function PersonCard({ person, direction, onSettle }) {
  const [expanded, setExpanded] = useState(false);
  const youOwe = direction === 'you_owe';
  const amountCents = Math.abs(person.netAmountCents);

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-4">
        <div
          className={
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold ' +
            (youOwe
              ? 'bg-danger/15 text-danger'
              : 'bg-success/15 text-success')
          }
        >
          {initialOf(person)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">
            {person.otherUserName}
          </div>
          <div className="truncate text-xs text-muted">
            {person.otherUserEmail}
          </div>
        </div>
        <div className="text-right">
          <div
            className={
              'text-xl font-bold ' + (youOwe ? 'text-danger' : 'text-success')
            }
          >
            {formatCents(amountCents)}
          </div>
          <div className="text-xs text-muted">
            {youOwe ? 'you owe' : 'owes you'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-fg"
        >
          <ChevronDown
            size={14}
            className={
              'transition-transform ' + (expanded ? 'rotate-180' : '')
            }
          />
          {person.groupBreakdown.length}{' '}
          {person.groupBreakdown.length === 1 ? 'group' : 'groups'}
        </button>
        {youOwe ? (
          // You owe them — informational only, no settle action here.
          <span className="ml-auto rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Pay Back
          </span>
        ) : (
          // They owe you — you can record the settlement.
          <button
            onClick={() => onSettle(person, direction)}
            className="ml-auto rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            Settle Up
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {person.groupBreakdown.map((g) => {
                const gOwe = g.netAmountCents < 0;
                return (
                  <div
                    key={g.groupId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-muted">{g.groupName}</span>
                    <span
                      className={
                        'font-medium ' + (gOwe ? 'text-danger' : 'text-success')
                      }
                    >
                      {gOwe ? '-' : '+'}
                      {formatCents(Math.abs(g.netAmountCents))}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -- Skeleton ----------------------------------------------------------------
function Skeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-2xl border border-border bg-surface" />
        <div className="h-28 rounded-2xl border border-border bg-surface" />
      </div>
      <div className="h-20 rounded-2xl border border-border bg-surface" />
      <div className="space-y-3">
        <div className="h-5 w-40 rounded bg-surface" />
        <div className="h-24 rounded-xl border border-border bg-surface" />
        <div className="h-24 rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}

// -- Page --------------------------------------------------------------------
export default function Summary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [intent, setIntent] = useState(null);

  const load = useCallback(async ({ silent } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const d = await api.getBalancesSummary();
      setSummary(d);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time: when a settlement touches this user, refetch the summary.
  usePusher(user ? `user-${user.id}` : null, {
    'balance-updated': () => load({ silent: true }),
  });

  const { owedToMe, iOwe, netCents } = useMemo(() => {
    const balances = summary?.balances || [];
    return {
      owedToMe: balances
        .filter((b) => b.netAmountCents > 0)
        .sort((a, b) => b.netAmountCents - a.netAmountCents),
      iOwe: balances
        .filter((b) => b.netAmountCents < 0)
        .sort((a, b) => a.netAmountCents - b.netAmountCents),
      netCents: (summary?.totalOwedToMe || 0) - (summary?.totalIOwe || 0),
    };
  }, [summary]);

  function openSettle(person, direction) {
    const youOwe = direction === 'you_owe';
    // Settle every group whose debt runs in this direction; the total is the
    // sum of those legs (the backend fully settles each group's pairwise debt).
    const groups = (person.groupBreakdown || [])
      .filter((g) =>
        youOwe ? g.netAmountCents < 0 : g.netAmountCents > 0
      )
      .map((g) => ({
        groupId: g.groupId,
        groupName: g.groupName,
        amountCents: Math.abs(g.netAmountCents),
      }));
    const amountCents = groups.reduce((s, g) => s + g.amountCents, 0);
    setIntent({
      currentUserId: user.id,
      otherUserId: person.otherUserId,
      otherName: person.otherUserName,
      otherEmail: person.otherUserEmail,
      direction,
      amountCents,
      groups,
    });
  }

  const allSettled =
    summary &&
    (summary.totalOwedToMe || 0) === 0 &&
    (summary.totalIOwe || 0) === 0;

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
            <Scale size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Summary</h1>
            <p className="text-sm text-muted">
              Your balances across every group.
            </p>
          </div>
        </div>
        <button
          onClick={() => load({ silent: true })}
          disabled={loading || refreshing}
          aria-label="Refresh"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="mt-8">
        {loading ? (
          <Skeleton />
        ) : allSettled ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper size={30} />
            </div>
            <h2 className="text-lg font-semibold text-success">
              You are all settled up
            </h2>
            <p className="max-w-xs text-sm text-muted">
              No outstanding balances with anyone across your groups. Nice and
              tidy.
            </p>
          </div>
        ) : (
          <>
            {/* Section 1 — hero cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <ArrowDownLeft size={16} className="text-success" />
                  Total you are owed
                </div>
                <div className="mt-2 text-3xl font-bold text-success">
                  ${dollars(summary.totalOwedToMe || 0)}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <ArrowUpRight size={16} className="text-danger" />
                  Total you owe
                </div>
                <div className="mt-2 text-3xl font-bold text-danger">
                  ${dollars(summary.totalIOwe || 0)}
                </div>
              </div>
            </div>

            {/* Net balance card */}
            <div className="mt-4 rounded-2xl border border-border bg-surface p-5 text-center">
              {netCents > 0 ? (
                <p className="text-lg font-semibold text-success">
                  Overall you are owed ${dollars(netCents)}
                </p>
              ) : netCents < 0 ? (
                <p className="text-lg font-semibold text-danger">
                  Overall you owe ${dollars(-netCents)}
                </p>
              ) : (
                <p className="text-lg font-semibold text-success">
                  All settled up
                </p>
              )}
            </div>

            {/* Section 2 — people who owe you */}
            {owedToMe.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  Owes you
                </h2>
                <div className="space-y-3">
                  {owedToMe.map((person) => (
                    <PersonCard
                      key={person.otherUserId}
                      person={person}
                      direction="owes_you"
                      onSettle={openSettle}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 3 — people you owe */}
            {iOwe.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                  You owe
                </h2>
                <div className="space-y-3">
                  {iOwe.map((person) => (
                    <PersonCard
                      key={person.otherUserId}
                      person={person}
                      direction="you_owe"
                      onSettle={openSettle}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Last updated */}
      {!loading && summary?.generatedAt && (
        <p className="mt-10 text-center text-xs text-muted">
          Last updated{' '}
          {formatDistanceToNow(new Date(summary.generatedAt), {
            addSuffix: true,
          })}
        </p>
      )}

      <SettleUpModal
        intent={intent}
        onClose={() => setIntent(null)}
        onSettled={() => load({ silent: true })}
      />
    </div>
  );
}
