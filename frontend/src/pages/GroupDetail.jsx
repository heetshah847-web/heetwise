import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, toCents, formatCents } from '../api/client.js';

function memberLabel(m) {
  return m.name ? `${m.name} (${m.email})` : m.email;
}

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

  // Add-member form
  const [memberEmail, setMemberEmail] = useState('');

  // Add-expense form (equal split among selected members)
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState('');
  const [participantIds, setParticipantIds] = useState([]);

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
      if (participantIds.length === 0) {
        setParticipantIds(g.group.members.map((m) => m.id));
      }
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

  function toggleParticipant(id) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createExpense(groupId, {
        description,
        amountCents: toCents(amount),
        splitType: 'EQUAL',
        paidById,
        participantIds,
      });
      setDescription('');
      setAmount('');
      await load();
    } catch (err) {
      setError(err.message);
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
        <h2>Expenses</h2>
        <form onSubmit={handleAddExpense} style={{ marginBottom: 16 }}>
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            style={{ padding: 8, marginRight: 8 }}
          />
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount ($)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            style={{ padding: 8, width: 120, marginRight: 8 }}
          />
          <label style={{ marginRight: 8 }}>
            Paid by{' '}
            <select value={paidById} onChange={(e) => setPaidById(e.target.value)}>
              {group.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div style={{ margin: '8px 0' }}>
            Split equally between:
            {group.members.map((m) => (
              <label key={m.id} style={{ marginLeft: 8 }}>
                <input
                  type="checkbox"
                  checked={participantIds.includes(m.id)}
                  onChange={() => toggleParticipant(m.id)}
                />
                {m.name || m.email}
              </label>
            ))}
          </div>
          <button type="submit" style={{ padding: '8px 16px' }}>
            Add expense
          </button>
        </form>

        {expenses.length === 0 ? (
          <p>No expenses yet.</p>
        ) : (
          <ul>
            {expenses.map((ex) => (
              <li key={ex.id} style={{ marginBottom: 6 }}>
                {ex.description} — {formatCents(ex.amountCents)} paid by{' '}
                {ex.paidBy?.name || ex.paidBy?.email}{' '}
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
