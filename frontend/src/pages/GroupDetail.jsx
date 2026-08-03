import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { api, formatCents } from '../api/client.js';
import { cn } from '../lib/cn.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePusher } from '../hooks/usePusher.js';
import SettleUpModal from '../components/SettleUpModal.jsx';

function memberLabel(m) {
  return m.name ? `${m.name} (${m.email})` : m.email;
}

function initialOf(m) {
  return (m.name || m.email || '?').charAt(0).toUpperCase();
}

const SPLIT_OPTIONS = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'EXACT', label: 'Exact amounts' },
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'WEIGHT', label: 'By weight' },
];

const sectionCls = 'rounded-xl border border-border bg-surface p-5';
const headingCls = 'mb-4 text-xs font-semibold uppercase tracking-wide text-muted';

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]); // suggested (simplified) plan
  const [history, setHistory] = useState([]); // recorded past settlements
  const [tab, setTab] = useState('activity'); // 'activity' | 'history'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [settleIntent, setSettleIntent] = useState(null);
  // Stable idempotency key for the in-flight expense submit: reused across
  // retries of the same expense, regenerated only after a successful create.
  const expenseKeyRef = useRef(null);

  // Add-member form
  const [memberEmail, setMemberEmail] = useState('');

  // Add-expense form
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState('');
  const [splitType, setSplitType] = useState('EQUAL');
  const [currency, setCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState(['USD']);
  const [rates, setRates] = useState({}); // CUR -> USD, display only
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null);
  // Per-member inputs, keyed by userId (string values from the inputs).
  const [exactAmounts, setExactAmounts] = useState({});
  const [percentages, setPercentages] = useState({});
  const [weights, setWeights] = useState({});
  // Ticked members participate in the split. Default: everyone ticked
  // (a member is included unless explicitly set to false).
  const [checked, setChecked] = useState({});

  const load = useCallback(async () => {
    setError('');
    try {
      const [g, e, b, c, r, h] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalances(groupId),
        api.listCurrencies(),
        api.getRates(),
        api.listSettlements(groupId),
      ]);
      setGroup(g.group);
      setExpenses(e.expenses);
      setNextCursor(e.nextCursor);
      setHasMore(e.hasMore);
      setBalances(b.balances);
      setSettlements(b.settlements);
      setHistory(h.settlements);
      setCurrencies(c.currencies.length ? c.currencies : ['USD']);
      setRates(r.rates || {});
      setRatesUpdatedAt(r.updatedAt || null);
      if (!paidById && g.group.members[0]) setPaidById(g.group.members[0].id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh balances + settlement history (used after live events / settling).
  const refreshBalances = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([
        api.getBalances(groupId),
        api.listSettlements(groupId),
      ]);
      setBalances(b.balances);
      setSettlements(b.settlements);
      setHistory(h.settlements);
    } catch {
      /* non-critical */
    }
  }, [groupId]);

  // Refetch the expense list (settling can change what's owed / shown).
  const refreshExpenses = useCallback(async () => {
    try {
      const e = await api.listExpenses(groupId);
      setExpenses(e.expenses);
      setNextCursor(e.nextCursor);
      setHasMore(e.hasMore);
    } catch {
      /* non-critical */
    }
  }, [groupId]);

  // Real-time: prepend expenses added by anyone; on a settlement, refetch the
  // balances, expense list and settlement history so the cascade is instant.
  usePusher(`private-group-${groupId}`, {
    'expense-added': (payload) => {
      const ex = payload?.expense;
      if (!ex) return;
      setExpenses((prev) =>
        prev.some((p) => p.id === ex.id) ? prev : [ex, ...prev]
      );
      refreshBalances();
    },
    'settlement-created': () => {
      refreshBalances();
      refreshExpenses();
    },
  });

  async function loadMore() {
    if (!nextCursor) return;
    setError('');
    try {
      const e = await api.listExpenses(groupId, { cursor: nextCursor });
      setExpenses((prev) => [...prev, ...e.expenses]);
      setNextCursor(e.nextCursor);
      setHasMore(e.hasMore);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    setError('');
    try {
      await api.addMember(groupId, memberEmail);
      setMemberEmail('');
      toast.success('Invitation sent — they join once they accept');
    } catch (err) {
      setError(err.message);
    }
  }

  // ---- Derived split state (recomputed every render, live) ----
  const members = group?.members ?? [];
  const isChecked = (id) => checked[id] !== false; // default ticked
  const tickedMembers = members.filter((m) => isChecked(m.id));
  const total = Number(amount) || 0;
  const weightOf = (id) => Number(weights[id] ?? '1');

  function toggleChecked(id) {
    // Flip: currently-false → true, otherwise → false.
    setChecked((p) => ({ ...p, [id]: p[id] === false }));
  }

  const exactAssigned = tickedMembers.reduce(
    (s, m) => s + (Number(exactAmounts[m.id]) || 0),
    0
  );
  const exactRemaining = total - exactAssigned;

  const percentTotal = tickedMembers.reduce(
    (s, m) => s + (Number(percentages[m.id]) || 0),
    0
  );
  const percentRemaining = 100 - percentTotal;

  const weightSum = tickedMembers.reduce((s, m) => s + weightOf(m.id), 0);
  const anyBadWeight = tickedMembers.some((m) => !(weightOf(m.id) > 0));

  function invalidReason() {
    if (!description.trim()) return 'Enter a description';
    if (!(total > 0)) return 'Enter an amount greater than $0';
    if (tickedMembers.length === 0) return 'Select at least one member to split with';
    if (splitType === 'EXACT' && Math.abs(exactRemaining) > 0.01) {
      return `Exact amounts must sum to $${total.toFixed(2)} — $${Math.abs(
        exactRemaining
      ).toFixed(2)} ${exactRemaining > 0 ? 'left to assign' : 'over'}`;
    }
    if (splitType === 'PERCENTAGE' && Math.abs(percentRemaining) > 0.01) {
      return `Percentages must total 100% — ${Math.abs(percentRemaining).toFixed(
        2
      )}% ${percentRemaining > 0 ? 'remaining' : 'over'}`;
    }
    if (splitType === 'WEIGHT' && anyBadWeight) {
      return 'Every weight must be greater than 0';
    }
    return null;
  }
  const reason = invalidReason();

  // Only TICKED members go into the split payload.
  function buildMembersPayload() {
    return tickedMembers.map((m) => {
      if (splitType === 'EXACT') {
        return { userId: m.id, amount: Number(exactAmounts[m.id]) || 0 };
      }
      if (splitType === 'PERCENTAGE') {
        return { userId: m.id, percentage: Number(percentages[m.id]) || 0 };
      }
      if (splitType === 'WEIGHT') {
        return { userId: m.id, weight: weightOf(m.id) };
      }
      return { userId: m.id };
    });
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    if (reason) return;
    setError('');
    setSubmitting(true);
    if (!expenseKeyRef.current) {
      expenseKeyRef.current =
        globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
    }
    try {
      await api.createExpense(groupId, {
        description,
        amount: total,
        currency,
        paidBy: paidById,
        splitType,
        members: buildMembersPayload(),
        idempotencyKey: expenseKeyRef.current,
      });
      expenseKeyRef.current = null; // success → next expense gets a fresh key
      setDescription('');
      setAmount('');
      setExactAmounts({});
      setPercentages({});
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteExpense(id) {
    setError('');
    try {
      await api.deleteExpense(groupId, id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Build a settle intent. Only ever called for a settlement where the OTHER
  // person owes the current user (s.from is the debtor, s.to is the viewer).
  function settleFor(s) {
    const other = s.from;
    setSettleIntent({
      currentUserId: user.id,
      otherUserId: other.id,
      otherName: other.name || other.email,
      otherEmail: other.email,
      direction: 'owes_you',
      amountCents: s.amountCents,
      groups: [
        { groupId, groupName: group?.name, amountCents: s.amountCents },
      ],
    });
  }

  // Display name for a settlement party (the viewer shows as "You").
  const personName = (u) =>
    u?.id === user?.id ? 'You' : u?.name || u?.email || 'Someone';

  // Combined activity feed: expenses + recorded settlements, newest first, so a
  // fresh settlement appears at the top with its green checkmark.
  const activity = useMemo(() => {
    const items = [
      ...expenses.map((ex) => ({
        kind: 'expense',
        id: ex.id,
        date: ex.createdAt,
        data: ex,
      })),
      ...history.map((s) => ({
        kind: 'settlement',
        id: s.id,
        date: s.settledAt,
        data: s,
      })),
    ];
    return items.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, history]);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  if (!group)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        {error || 'Not found'}
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl pb-16">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/groups"
            className="text-muted transition-colors hover:text-brand-400"
            aria-label="Back to groups"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">{group.name}</h1>
        </div>
        <Link
          to={`/groups/${groupId}/stats`}
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <BarChart3 size={16} /> Stats
        </Link>
      </header>

      <div className="space-y-6 p-6">
        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Members */}
        <section className={sectionCls}>
          <h2 className={headingCls}>Members</h2>
          <div className="flex flex-wrap gap-4">
            {group.members.map((m) => (
              <Link
                key={m.id}
                to={`/groups/${groupId}/members/${m.id}/stats`}
                className="group flex w-16 flex-col items-center gap-1"
                title={memberLabel(m)}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-lg font-semibold text-brand-400 ring-1 ring-border transition group-hover:ring-brand-500/60">
                  {initialOf(m)}
                </div>
                <span className="w-full truncate text-center text-xs text-muted">
                  {m.name || m.email}
                </span>
              </Link>
            ))}
          </div>

          <form onSubmit={handleAddMember} className="mt-5 flex gap-2">
            <input
              type="email"
              placeholder="Invite member by email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              required
              className="flex-1"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Invite
            </button>
          </form>
        </section>

        {/* Balances */}
        <section className={sectionCls}>
          <h2 className={headingCls}>Balances</h2>
          <p className="mb-3 text-xs text-muted">
            All balances are calculated in USD.
            {ratesUpdatedAt
              ? ` Exchange rates last updated ${new Date(
                  ratesUpdatedAt
                ).toLocaleString()}.`
              : ' Exchange rates have not been loaded yet.'}
          </p>
          <div className="space-y-2">
            {balances.map((b) => {
              const positive = b.netCents >= 0;
              return (
                <div
                  key={b.user.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg border-l-4 bg-bg px-4 py-3',
                    positive ? 'border-success' : 'border-danger'
                  )}
                >
                  <span className="text-sm">{memberLabel(b.user)}</span>
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      positive ? 'text-success' : 'text-danger'
                    )}
                  >
                    {positive ? 'is owed ' : 'owes '}
                    {formatCents(Math.abs(b.netCents))}
                  </span>
                </div>
              );
            })}
          </div>

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
            Suggested settlements
          </h3>
          {settlements.length === 0 ? (
            <p className="text-sm text-muted">All settled up.</p>
          ) : (
            <div className="space-y-2">
              {settlements.map((s, i) => {
                // Show "Settle Up" only when that specific person owes the
                // current user (the viewer is the payee: s.to is me).
                const owesMe = s.to.id === user?.id && s.from.id !== user?.id;
                const iOwe = s.from.id === user?.id;
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{memberLabel(s.from)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-3 py-1 text-brand-400">
                      <ArrowRight size={14} />
                      {formatCents(s.amountCents)}
                    </span>
                    <span className="font-medium">{memberLabel(s.to)}</span>
                    {owesMe ? (
                      <button
                        onClick={() => settleFor(s)}
                        className="ml-auto rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110"
                      >
                        Settle Up
                      </button>
                    ) : iOwe ? (
                      // The viewer owes here — informational only, no action.
                      <span className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                        Pay Back
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Add expense */}
        <section className={sectionCls}>
          <h2 className={headingCls}>Add expense</h2>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Description</span>
                <input
                  placeholder="What was this for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Amount</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full"
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Paid by</span>
                <select
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className="w-full"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Split</span>
                <select
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value)}
                  className="w-full"
                >
                  {SPLIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {currency !== 'USD' && (
              <p className="text-xs text-muted">
                ≈ ${(total * (rates[currency] || 0)).toFixed(2)} USD (approx, at the
                last fetched rate — the server applies the live rate on save)
              </p>
            )}

            {/* Per-member rows: a checkbox controls who is included in the
                split; the input shown depends on the selected split type. */}
            <div className="rounded-lg border border-border bg-bg p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>Split between ({tickedMembers.length} selected)</span>
                {splitType === 'PERCENTAGE' && (
                  <span
                    className={cn(
                      Math.abs(percentRemaining) > 0.01
                        ? 'text-danger'
                        : 'text-success'
                    )}
                  >
                    {percentRemaining.toFixed(2)}% remaining
                  </span>
                )}
                {splitType === 'EXACT' && (
                  <span
                    className={cn(
                      Math.abs(exactRemaining) > 0.01
                        ? 'text-danger'
                        : 'text-success'
                    )}
                  >
                    ${exactRemaining.toFixed(2)} unassigned
                  </span>
                )}
              </div>

              {members.map((m) => {
                const on = isChecked(m.id);
                const w = weightOf(m.id);
                const share = weightSum > 0 && on ? (w / weightSum) * 100 : 0;
                return (
                  <div
                    key={m.id}
                    className="mb-2 flex items-center justify-between gap-2"
                  >
                    <label className="flex min-w-0 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleChecked(m.id)}
                        className="h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <span className={cn('truncate', !on && 'text-muted line-through')}>
                        {memberLabel(m)}
                      </span>
                    </label>

                    {!on ? (
                      <span className="text-xs text-muted">excluded</span>
                    ) : splitType === 'EQUAL' ? (
                      <span className="text-xs text-muted">even share</span>
                    ) : splitType === 'EXACT' ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={exactAmounts[m.id] ?? ''}
                        onChange={(e) =>
                          setExactAmounts((p) => ({ ...p, [m.id]: e.target.value }))
                        }
                        className="w-28"
                      />
                    ) : splitType === 'PERCENTAGE' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={percentages[m.id] ?? ''}
                          onChange={(e) =>
                            setPercentages((p) => ({ ...p, [m.id]: e.target.value }))
                          }
                          className="w-20"
                        />
                        <span className="text-muted">%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={weights[m.id] ?? '1'}
                          onChange={(e) =>
                            setWeights((p) => ({ ...p, [m.id]: e.target.value }))
                          }
                          className="w-20"
                        />
                        <span className="text-xs text-muted">
                          ≈ {share.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={Boolean(reason) || submitting}
                className="rounded-lg bg-brand-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add Expense'}
              </button>
              {reason && <span className="text-sm text-danger">{reason}</span>}
            </div>
          </form>
        </section>

        {/* Activity (expenses + settlements) and Settlement History tabs */}
        <section className={sectionCls}>
          <div className="mb-4 flex items-center gap-1 border-b border-border">
            {[
              { id: 'activity', label: 'Activity' },
              {
                id: 'history',
                label: `Settlement History${
                  history.length ? ` (${history.length})` : ''
                }`,
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'border-brand-500 text-fg'
                    : 'border-transparent text-muted hover:text-fg'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'activity' ? (
            activity.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {activity.map((item) =>
                  item.kind === 'settlement' ? (
                    <div
                      key={`s-${item.id}`}
                      className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3"
                    >
                      <CheckCircle2
                        size={18}
                        className="shrink-0 text-success"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {personName(item.data.from)} settled up with{' '}
                          {personName(item.data.to)}
                        </div>
                        <div className="text-xs text-muted">
                          {format(new Date(item.data.settledAt), 'PP')}
                        </div>
                      </div>
                      <div className="font-semibold text-success">
                        {formatCents(item.data.amountCents)}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 py-3 transition-colors hover:border-brand-500/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {item.data.description}
                        </div>
                        <div className="text-xs text-muted">
                          {item.data.splitType} · paid by{' '}
                          {item.data.paidBy?.name || item.data.paidBy?.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">
                            {Number(item.data.originalAmount).toFixed(2)}{' '}
                            <span className="text-xs text-muted">
                              {item.data.currency}
                            </span>
                          </div>
                          {item.data.currency !== 'USD' && (
                            <div className="text-xs text-muted">
                              = {formatCents(item.data.amountCents)} USD
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteExpense(item.data.id)}
                          className="rounded-md p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          aria-label="Delete expense"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )
                )}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    className="mt-3 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
                  >
                    Load more
                  </button>
                )}
              </div>
            )
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">No settlements recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-bg p-4"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {personName(s.from)} paid {personName(s.to)}
                    </div>
                    <div className="text-xs text-muted">
                      {format(new Date(s.settledAt), 'PPp')}
                    </div>
                  </div>
                  <div className="font-semibold text-success">
                    {formatCents(s.amountCents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <SettleUpModal
        intent={settleIntent}
        onClose={() => setSettleIntent(null)}
        onSettled={() => {
          refreshBalances();
          refreshExpenses();
        }}
      />
    </div>
  );
}
