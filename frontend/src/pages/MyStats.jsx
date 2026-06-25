import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../api/client.js';
import { COLORS, POSITIVE, NEGATIVE, formatUSD, monthLabel } from '../theme.js';

const cardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

export default function MyStats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getMyStats()
      .then(setS)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ padding: 24, color: 'crimson' }}>{error}</p>;
  if (!s) return <p style={{ padding: 24 }}>Loading…</p>;

  const trend = s.six_month_trend.map((m) => ({
    label: monthLabel(m),
    paid: m.total_paid,
    consumed: m.total_consumed,
  }));
  const owes = s.total_owed > 0;

  return (
    <div style={{ maxWidth: 880, margin: '32px auto', fontFamily: 'sans-serif', padding: 16 }}>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>
      <h1>Your statistics</h1>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>
            {formatUSD(s.total_paid_this_month)}
          </div>
          <div style={{ color: '#6b7280' }}>Paid this month</div>
        </div>
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: owes ? NEGATIVE : POSITIVE,
            }}
          >
            {owes ? '−' : '+'}
            {formatUSD(Math.abs(s.total_owed))}
          </div>
          <div style={{ color: '#6b7280' }}>
            {owes ? 'Net you owe' : 'Net owed to you'}
          </div>
        </div>
      </div>

      {s.most_active_group && (
        <div style={{ ...cardStyle, marginTop: 20, maxWidth: 320 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Most active group</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            <Link to={`/groups/${s.most_active_group.id}`}>
              {s.most_active_group.name}
            </Link>
          </div>
          <div style={{ color: '#6b7280' }}>
            {s.most_active_group.expense_count} expenses paid
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Paid vs consumed (6 months)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={trend}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip formatter={(v) => formatUSD(v)} />
          <Legend />
          <Line type="monotone" dataKey="paid" name="Paid" stroke={COLORS[0]} strokeWidth={2} />
          <Line
            type="monotone"
            dataKey="consumed"
            name="Consumed"
            stroke={COLORS[1]}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>

      <h2 style={{ marginTop: 24 }}>Per-group breakdown</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: 8 }}>Group</th>
            <th style={{ padding: 8 }}>Total spending</th>
            <th style={{ padding: 8 }}>Your net balance</th>
          </tr>
        </thead>
        <tbody>
          {s.group_breakdown.map((g) => {
            const positive = g.net_balance >= 0;
            return (
              <tr key={g.groupId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>
                  <Link to={`/groups/${g.groupId}`}>{g.name}</Link>
                </td>
                <td style={{ padding: 8 }}>{formatUSD(g.total_spending)}</td>
                <td style={{ padding: 8, color: positive ? POSITIVE : NEGATIVE }}>
                  {positive ? '+' : '−'}
                  {formatUSD(Math.abs(g.net_balance))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
