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
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client.js';
import { COLORS, POSITIVE, NEGATIVE, formatUSD, monthLabel } from '../theme.js';

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

export default function MyStats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getMyStats()
      .then(setS)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="p-8 text-danger">{error}</div>;
  if (!s) return <div className="p-8 text-muted">Loading…</div>;

  const trend = s.six_month_trend.map((m) => ({
    label: monthLabel(m),
    paid: m.total_paid,
    consumed: m.total_consumed,
  }));
  const owes = s.total_owed > 0;

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand-400"
      >
        <ArrowLeft size={16} /> Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Your statistics</h1>

      <div className="mt-6 flex flex-wrap items-end gap-10">
        <div>
          <div className="text-4xl font-bold">
            {formatUSD(s.total_paid_this_month)}
          </div>
          <div className="text-sm text-muted">Paid this month</div>
        </div>
        <div>
          <div
            className="text-3xl font-bold"
            style={{ color: owes ? NEGATIVE : POSITIVE }}
          >
            {owes ? '−' : '+'}
            {formatUSD(Math.abs(s.total_owed))}
          </div>
          <div className="text-sm text-muted">
            {owes ? 'Net you owe' : 'Net owed to you'}
          </div>
        </div>
      </div>

      {s.most_active_group && (
        <div className="mt-6 max-w-sm rounded-xl border border-border bg-surface p-5">
          <div className="text-xs text-muted">Most active group</div>
          <div className="mt-1 text-lg font-semibold">
            <Link
              to={`/groups/${s.most_active_group.id}`}
              className="text-brand-400 hover:text-brand-500"
            >
              {s.most_active_group.name}
            </Link>
          </div>
          <div className="text-sm text-muted">
            {s.most_active_group.expense_count} expenses paid
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">
          Paid vs consumed (6 months)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip formatter={(v) => formatUSD(v)} {...tooltipStyle} />
            <Legend wrapperStyle={{ color: '#fafafa' }} />
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
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-fg">Per-group breakdown</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-4 font-medium">Group</th>
              <th className="py-2 pr-4 font-medium">Total spending</th>
              <th className="py-2 font-medium">Your net balance</th>
            </tr>
          </thead>
          <tbody>
            {s.group_breakdown.map((g) => {
              const positive = g.net_balance >= 0;
              return (
                <tr key={g.groupId} className="border-b border-border/60">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/groups/${g.groupId}`}
                      className="text-brand-400 hover:text-brand-500"
                    >
                      {g.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{formatUSD(g.total_spending)}</td>
                  <td
                    className="py-2"
                    style={{ color: positive ? POSITIVE : NEGATIVE }}
                  >
                    {positive ? '+' : '−'}
                    {formatUSD(Math.abs(g.net_balance))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
