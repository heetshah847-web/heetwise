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
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client.js';
import { COLORS, formatUSD, monthLabel } from '../theme.js';

const axisProps = { stroke: '#2a2a2a', tick: { fill: '#71717a', fontSize: 12 } };
const tooltipStyle = {
  contentStyle: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    color: '#fafafa',
  },
  itemStyle: { color: '#fafafa' },
  labelStyle: { color: '#71717a' },
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
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

  if (error) return <div className="p-8 text-danger">{error}</div>;
  if (!s) return <div className="p-8 text-muted">Loading…</div>;

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
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <Link
        to={`/groups/${groupId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand-400"
      >
        <ArrowLeft size={16} /> Back to group
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Group statistics</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total spent" value={formatUSD(s.total_spent)} />
        <StatCard label="Expenses" value={s.expense_count} />
        <StatCard label="Average expense" value={formatUSD(s.average_expense)} />
        <StatCard
          label="Largest expense"
          value={s.largest_expense ? formatUSD(s.largest_expense.amount) : '—'}
        />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">
          Monthly spending (last 12 months)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip formatter={(v) => formatUSD(v)} {...tooltipStyle} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="total" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">Who paid what</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" outerRadius={110} label>
              {pie.map((entry, i) => (
                <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatUSD(v)} {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="mt-2 space-y-1 text-sm">
          {pie.map((p, i) => (
            <li key={p.name} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-fg">{p.name}</span>
              <span className="text-muted">
                {formatUSD(p.value)} ({p.pct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      {s.currency_breakdown.length > 1 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-fg">
            Currency breakdown (raw, pre-conversion)
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {s.currency_breakdown.map((c) => (
              <div
                key={c.currency}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="text-xs text-muted">{c.currency}</div>
                <div className="mt-1 text-lg font-semibold">
                  {Number(c.original_total).toFixed(2)} {c.currency}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
