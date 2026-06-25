import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { api } from '../api/client.js';
import { COLORS, POSITIVE, NEGATIVE, formatUSD, monthLabel } from '../theme.js';

export default function MemberStats() {
  const { groupId, memberId } = useParams();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getMemberStats(groupId, memberId)
      .then(setS)
      .catch((err) => setError(err.message));
  }, [groupId, memberId]);

  if (error) return <p style={{ padding: 24, color: 'crimson' }}>{error}</p>;
  if (!s) return <p style={{ padding: 24 }}>Loading…</p>;

  const trend = s.monthly_net_trend.map((m) => ({
    label: monthLabel(m),
    net: m.net_balance,
  }));
  const owed = s.net_balance >= 0;

  return (
    <div style={{ maxWidth: 760, margin: '32px auto', fontFamily: 'sans-serif', padding: 16 }}>
      <p>
        <Link to={`/groups/${groupId}`}>← Back to group</Link>
      </p>
      <h1>Member statistics</h1>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {formatUSD(s.total_paid)}
          </div>
          <div style={{ color: '#6b7280' }}>Total paid</div>
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {formatUSD(s.total_consumed)}
          </div>
          <div style={{ color: '#6b7280' }}>Total consumed</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <span style={{ color: '#6b7280', marginRight: 8 }}>Net balance:</span>
        <strong style={{ fontSize: 24, color: owed ? POSITIVE : NEGATIVE }}>
          {owed ? '+' : '−'}
          {formatUSD(Math.abs(s.net_balance))}
        </strong>
        <span style={{ marginLeft: 8, color: '#6b7280' }}>
          {owed ? '(is owed money)' : '(owes money)'}
        </span>
      </div>

      <h2 style={{ marginTop: 24 }}>Net balance trend (6 months)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip formatter={(v) => formatUSD(v)} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} />
          <Line type="monotone" dataKey="net" stroke={COLORS[0]} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <h2 style={{ marginTop: 24 }}>Top paid-for items</h2>
      {s.top_categories.length === 0 ? (
        <p>No expenses paid yet.</p>
      ) : (
        <ol>
          {s.top_categories.map((c) => (
            <li key={c.description}>
              {c.description} — {c.count}×
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
