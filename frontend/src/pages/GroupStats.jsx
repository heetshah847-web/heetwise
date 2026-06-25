import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../api/client.js';
import { COLORS, formatUSD, monthLabel } from '../theme.js';

const cardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

function StatCard({ label, value }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function GroupStats() {
  const { groupId } = useParams();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getGroupStats(groupId)
      .then(setS)
      .catch((err) => setError(err.message));
  }, [groupId]);

  if (error) return <p style={{ padding: 24, color: 'crimson' }}>{error}</p>;
  if (!s) return <p style={{ padding: 24 }}>Loading…</p>;

  const monthly = s.monthly_breakdown.map((m) => ({
    label: monthLabel(m),
    total: m.total,
  }));
  const pie = s.payer_breakdown.map((p) => ({
    name: p.name || 'Unknown',
    value: p.total_paid,
    pct: s.total_spent ? (p.total_paid / s.total_spent) * 100 : 0,
  }));

  return (
    <div style={{ maxWidth: 880, margin: '32px auto', fontFamily: 'sans-serif', padding: 16 }}>
      <p>
        <Link to={`/groups/${groupId}`}>← Back to group</Link>
      </p>
      <h1>Group statistics</h1>

      {/* 2x2 on mobile, 1x4 on desktop */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="Total spent" value={formatUSD(s.total_spent)} />
        <StatCard label="Expenses" value={s.expense_count} />
        <StatCard label="Average expense" value={formatUSD(s.average_expense)} />
        <StatCard
          label="Largest expense"
          value={s.largest_expense ? formatUSD(s.largest_expense.amount) : '—'}
        />
      </div>

      <h2>Monthly spending (last 12 months)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip formatter={(v) => formatUSD(v)} />
          <Bar dataKey="total" fill={COLORS[0]} />
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ marginTop: 24 }}>Who paid what</h2>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={pie} dataKey="value" nameKey="name" outerRadius={110} label>
            {pie.map((entry, i) => (
              <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatUSD(v)} />
        </PieChart>
      </ResponsiveContainer>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pie.map((p, i) => (
          <li key={p.name} style={{ marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                background: COLORS[i % COLORS.length],
                marginRight: 8,
              }}
            />
            {p.name}: {formatUSD(p.value)} ({p.pct.toFixed(1)}%)
          </li>
        ))}
      </ul>

      {s.currency_breakdown.length > 1 && (
        <>
          <h2 style={{ marginTop: 24 }}>Currency breakdown (raw, pre-conversion)</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {s.currency_breakdown.map((c) => (
              <div key={c.currency} style={cardStyle}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{c.currency}</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {Number(c.original_total).toFixed(2)} {c.currency}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
