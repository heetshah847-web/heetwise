import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatCents } from '../api/client.js';

function memberLabel(m) {
  return m.name ? `${m.name} (${m.email})` : m.email;
}

const SPLIT_OPTIONS = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'EXACT', label: 'Exact amounts' },
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'WEIGHT', label: 'By weight' },
];

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
  // Per-member inputs, keyed by userId (string values from the inputs).
  const [exactAmounts, setExactAmounts] = useState({});
  const [percentages, setPercentages] = useState({});
  const [weights, setWeights] = useState({});

  const load = useCallback(async () => {
    setError('');
    try {
      const [g, e, b] = await Promise.all([
        api.getGroup(groupId),
        api.listExpenses(groupId),
        api.getBalances(groupId),
      ]);
      setGroup(g.group);
      setExpenses(e.expenses);
      setNextCursor(e.nextCursor);
      setHasMore(e.hasMore);
      setBalances(b.balances);
      setSettlements(b.settlements);
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
        currency: 'USD',
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

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!group) return <p style={{ padding: 24 }}>{error || 'Not found'}</p>;

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', fontFamily: 'sans-serif' }}>
      <p>
        <Link to="/groups">← All groups</Link>
      </p>
      <h1>{group.name}</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section>
        <h2>Members</h2>
        <ul>
          {group.members.map((m) => (
            <li key={m.id}>{memberLabel(m)}</li>
          ))}
        </ul>
        <form onSubmit={handleAddMember}>
          <input
            type="email"
            placeholder="Add member by email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            required
            style={{ padding: 8, width: 240 }}
          />
          <button type="submit" style={{ padding: '8px 16px', marginLeft: 8 }}>
            Add
          </button>
        </form>
      </section>

      <section>
        <h2>Balances</h2>
        <ul>
          {balances.map((b) => (
            <li key={b.user.id}>
              {memberLabel(b.user)}:{' '}
              <strong style={{ color: b.netCents < 0 ? 'crimson' : 'green' }}>
                {b.netCents >= 0 ? 'is owed ' : 'owes '}
                {formatCents(Math.abs(b.netCents))}
              </strong>
            </li>
          ))}
        </ul>
        <h3>Suggested settlements</h3>
        {settlements.length === 0 ? (
          <p>All settled up.</p>
        ) : (
          <ul>
            {settlements.map((s, i) => (
              <li key={i}>
                {memberLabel(s.from)} → {memberLabel(s.to)}:{' '}
                {formatCents(s.amountCents)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Add expense</h2>
        <form onSubmit={handleAddExpense} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: 8, marginRight: 8 }}
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ padding: 8, width: 120, marginRight: 8 }}
            />
            <label style={{ marginRight: 8 }}>
              Paid by{' '}
              <select
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {memberLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Split{' '}
              <select
                value={splitType}
                onChange={(e) => setSplitType(e.target.value)}
              >
                {SPLIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Per-member inputs depend on the selected split type. */}
          <div style={{ margin: '8px 0' }}>
            {splitType === 'EQUAL' && (
              <ul>
                {members.map((m) => (
                  <li key={m.id}>{memberLabel(m)}</li>
                ))}
              </ul>
            )}

            {splitType === 'EXACT' && (
              <>
                {members.map((m) => (
                  <div key={m.id} style={{ marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 220 }}>
                      {memberLabel(m)}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={exactAmounts[m.id] ?? ''}
                      onChange={(e) =>
                        setExactAmounts((p) => ({ ...p, [m.id]: e.target.value }))
                      }
                      style={{ padding: 6, width: 100 }}
                    />
                  </div>
                ))}
                <p style={{ color: Math.abs(exactRemaining) > 0.01 ? 'crimson' : 'green' }}>
                  Assigned ${exactAssigned.toFixed(2)} of ${total.toFixed(2)} —{' '}
                  ${exactRemaining.toFixed(2)} unassigned
                </p>
              </>
            )}

            {splitType === 'PERCENTAGE' && (
              <>
                {members.map((m) => (
                  <div key={m.id} style={{ marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 220 }}>
                      {memberLabel(m)}
                    </span>
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
                      style={{ padding: 6, width: 80 }}
                    />
                    {' %'}
                  </div>
                ))}
                <p style={{ color: Math.abs(percentRemaining) > 0.01 ? 'crimson' : 'green' }}>
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
                    <div key={m.id} style={{ marginBottom: 4 }}>
                      <span style={{ display: 'inline-block', width: 220 }}>
                        {memberLabel(m)}
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={weights[m.id] ?? '1'}
                        onChange={(e) =>
                          setWeights((p) => ({ ...p, [m.id]: e.target.value }))
                        }
                        style={{ padding: 6, width: 80 }}
                      />
                      <span style={{ marginLeft: 8, color: '#666' }}>
                        ≈ {share.toFixed(1)}% of total
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={Boolean(reason) || submitting}
            style={{ padding: '8px 16px' }}
          >
            {submitting ? 'Adding…' : 'Add expense'}
          </button>
          {reason && (
            <span style={{ marginLeft: 12, color: 'crimson' }}>{reason}</span>
          )}
        </form>

        <h2>Expenses</h2>
        {expenses.length === 0 ? (
          <p>No expenses yet.</p>
        ) : (
          <ul>
            {expenses.map((ex) => (
              <li key={ex.id} style={{ marginBottom: 6 }}>
                {ex.description} — {formatCents(ex.amountCents)} ({ex.splitType})
                paid by {ex.paidBy?.name || ex.paidBy?.email}{' '}
                <button
                  onClick={() => handleDeleteExpense(ex.id)}
                  style={{ marginLeft: 8 }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button onClick={loadMore} style={{ padding: '6px 12px' }}>
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
