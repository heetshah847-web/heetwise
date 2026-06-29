import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Trash2 } from 'lucide-react';
import { api, formatCents } from '../api/client.js';
import { cn } from '../lib/cn.js';

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
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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

  const load = useCallback(async () => {
    setError('');
    try {
      const [g, e, b, c, r] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalances(groupId),
        api.listCurrencies(),
        api.getRates(),
      ]);
      setGroup(g.group);
      setExpenses(e.expenses);
      setNextCursor(e.nextCursor);
      setHasMore(e.hasMore);
      setBalances(b.balances);
      setSettlements(b.settlements);
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
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // ---- Derived split state (recomputed every render, live) ----
  const members = group?.members ?? [];
  const total = Number(amount) || 0;
  const weightOf = (id) => Number(weights[id] ?? '1');

  const exactAssigned = members.reduce(
    (s, m) => s + (Number(exactAmounts[m.id]) || 0),
    0
  );
  const exactRemaining = total - exactAssigned;

  const percentTotal = members.reduce(
    (s, m) => s + (Number(percentages[m.id]) || 0),
    0
  );
  const percentRemaining = 100 - percentTotal;

  const weightSum = members.reduce((s, m) => s + weightOf(m.id), 0);
  const anyBadWeight = members.some((m) => !(weightOf(m.id) > 0));

  function invalidReason() {
    if (!description.trim()) return 'Enter a description';
    if (!(total > 0)) return 'Enter an amount greater than $0';
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

  function buildMembersPayload() {
    return members.map((m) => {
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
    try {
      await api.createExpense(groupId, {
        description,
        amount: total,
        currency,
        paidBy: paidById,
        splitType,
        members: buildMembersPayload(),
      });
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
              placeholder="Add member by email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              required
              className="flex-1"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Add
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
              {settlements.map((s, i) => (
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
                </div>
              ))}
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

            {/* Per-member inputs depend on the selected split type. */}
            <div className="rounded-lg border border-border bg-bg p-4">
              {splitType === 'EQUAL' && (
                <ul className="space-y-1 text-sm text-muted">
                  {members.map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{memberLabel(m)}</span>
                      <span>even share</span>
                    </li>
                  ))}
                </ul>
              )}

              {splitType === 'EXACT' && (
                <>
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="mb-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-sm">{memberLabel(m)}</span>
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
                    </div>
                  ))}
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      Math.abs(exactRemaining) > 0.01 ? 'text-danger' : 'text-success'
                    )}
                  >
                    Assigned ${exactAssigned.toFixed(2)} of ${total.toFixed(2)} — $
                    {exactRemaining.toFixed(2)} unassigned
                  </p>
                </>
              )}

              {splitType === 'PERCENTAGE' && (
                <>
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="mb-2 flex items-center justify-between gap-2"
                    >
                      <span className="text-sm">{memberLabel(m)}</span>
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
                    </div>
                  ))}
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      Math.abs(percentRemaining) > 0.01
                        ? 'text-danger'
                        : 'text-success'
                    )}
                  >
                    {percentRemaining.toFixed(2)}% remaining (of 100%)
                  </p>
                </>
              )}

              {splitType === 'WEIGHT' && (
                <>
                  {members.map((m) => {
                    const w = weightOf(m.id);
                    const share = weightSum > 0 ? (w / weightSum) * 100 : 0;
                    return (
                      <div
                        key={m.id}
                        className="mb-2 flex items-center justify-between gap-2"
                      >
                        <span className="text-sm">{memberLabel(m)}</span>
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
                            ≈ {share.toFixed(1)}% of total
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
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

        {/* Expenses */}
        <section className={sectionCls}>
          <h2 className={headingCls}>Expenses</h2>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted">No expenses yet.</p>
          ) : (
            <div className="space-y-2">
              {expenses.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 py-3 transition-colors hover:border-brand-500/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{ex.description}</div>
                    <div className="text-xs text-muted">
                      {ex.splitType} · paid by{' '}
                      {ex.paidBy?.name || ex.paidBy?.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">
                        {Number(ex.originalAmount).toFixed(2)}{' '}
                        <span className="text-xs text-muted">{ex.currency}</span>
                      </div>
                      {ex.currency !== 'USD' && (
                        <div className="text-xs text-muted">
                          = {formatCents(ex.amountCents)} USD
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteExpense(ex.id)}
                      className="rounded-md p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Delete expense"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && (
            <button
              onClick={loadMore}
              className="mt-3 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
            >
              Load more
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
