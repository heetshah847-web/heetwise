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
import { ArrowLeft } from 'lucide-react';
import { api, formatCents } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import SettleUpModal from '../components/SettleUpModal.jsx';
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

export default function MemberStats() {
  const { groupId, memberId } = useParams();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  // Pairwise settlement leg between the viewer and this member (if any).
  const [pairwise, setPairwise] = useState(null);
  const [settleIntent, setSettleIntent] = useState(null);

  useEffect(() => {
    api
      .getMemberStats(groupId, memberId)
      .then(setS)
      .catch((err) => setError(err.message));
  }, [groupId, memberId]);

  // Look at the group's suggested settlements for a leg between me and this
  // member — that's the concrete "you owe / owes you" amount to settle.
  useEffect(() => {
    if (!user || memberId === user.id) {
      setPairwise(null);
      return;
    }
    api
      .getBalances(groupId)
      .then((b) => {
        const leg = (b.settlements || []).find(
          (t) =>
            (t.from.id === user.id && t.to.id === memberId) ||
            (t.from.id === memberId && t.to.id === user.id)
        );
        setPairwise(leg || null);
      })
      .catch(() => setPairwise(null));
  }, [groupId, memberId, user]);

  function openSettle() {
    if (!pairwise) return;
    setSettleIntent({
      groupId,
      groupName: null,
      fromUserId: pairwise.from.id,
      fromName:
        pairwise.from.id === user.id
          ? 'You'
          : pairwise.from.name || pairwise.from.email,
      toUserId: pairwise.to.id,
      toName:
        pairwise.to.id === user.id
          ? 'You'
          : pairwise.to.name || pairwise.to.email,
      amountCents: pairwise.amountCents,
    });
  }

  if (error) return <div className="p-8 text-danger">{error}</div>;
  if (!s) return <div className="p-8 text-muted">Loading…</div>;

  const trend = s.monthly_net_trend.map((m) => ({
    label: monthLabel(m),
    net: m.net_balance,
  }));
  const owed = s.net_balance >= 0;

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <Link
        to={`/groups/${groupId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand-400"
      >
        <ArrowLeft size={16} /> Back to group
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Member statistics</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-2xl font-bold">{formatUSD(s.total_paid)}</div>
          <div className="text-sm text-muted">Total paid</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-2xl font-bold">{formatUSD(s.total_consumed)}</div>
          <div className="text-sm text-muted">Total consumed</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5">
        <div>
          <span className="text-sm text-muted">Net balance: </span>
          <strong
            className="text-2xl"
            style={{ color: owed ? POSITIVE : NEGATIVE }}
          >
            {owed ? '+' : '−'}
            {formatUSD(Math.abs(s.net_balance))}
          </strong>
          <span className="ml-2 text-sm text-muted">
            {owed ? '(is owed money)' : '(owes money)'}
          </span>
        </div>
        {pairwise && (
          <button
            onClick={openSettle}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Settle Up · {formatCents(pairwise.amountCents)}
          </button>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">
          Net balance trend (6 months)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip formatter={(v) => formatUSD(v)} {...tooltipStyle} />
            <ReferenceLine y={0} stroke="#71717a" strokeWidth={2} />
            <Line type="monotone" dataKey="net" stroke={COLORS[0]} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-fg">Top paid-for items</h2>
        {s.top_categories.length === 0 ? (
          <p className="text-sm text-muted">No expenses paid yet.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {s.top_categories.map((c) => (
              <li key={c.description} className="flex justify-between">
                <span>{c.description}</span>
                <span className="text-muted">{c.count}×</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <SettleUpModal
        intent={settleIntent}
        onClose={() => setSettleIntent(null)}
        onSettled={() => setPairwise(null)}
      />
    </div>
  );
}
