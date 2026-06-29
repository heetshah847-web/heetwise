import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Equal,
  Percent,
  Scale,
  ListChecks,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { CURRENCIES, currencyMeta, formatMoney } from '../lib/currencies.js';
import CurrencySelect from './CurrencySelect.jsx';
import Button from './Button.jsx';
import { cn } from '../lib/cn.js';

const STEPS = ['Amount & Currency', 'Split Details', 'Review & Confirm'];

const SPLIT_CARDS = [
  { value: 'EQUAL', label: 'Equal', icon: Equal, desc: 'Split evenly between everyone' },
  { value: 'EXACT', label: 'Exact amounts', icon: ListChecks, desc: 'Enter each person’s amount' },
  { value: 'PERCENTAGE', label: 'Percentage', icon: Percent, desc: 'Split by percentage shares' },
  { value: 'WEIGHT', label: 'By weight', icon: Scale, desc: 'Split by relative weights' },
];

const memberLabel = (m) => (m.name ? `${m.name} (${m.email})` : m.email);
const supportedCodes = Object.keys(CURRENCIES);

export default function AddExpenseWizard({
  groups = [],
  initialGroupId = null,
  onClose,
  onSuccess,
}) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [groupId, setGroupId] = useState(initialGroupId || groups[0]?.id || '');
  const [group, setGroup] = useState(null);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [splitType, setSplitType] = useState('EQUAL');
  const [paidById, setPaidById] = useState('');
  const [exactAmounts, setExactAmounts] = useState({});
  const [percentages, setPercentages] = useState({});
  const [weights, setWeights] = useState({});

  const [rates, setRates] = useState({});
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null);

  useEffect(() => {
    api.getRates().then((r) => {
      setRates(r.rates || {});
      setRatesUpdatedAt(r.updatedAt || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!groupId) return;
    api
      .getGroup(groupId)
      .then((g) => {
        setGroup(g.group);
        setPaidById((prev) => prev || g.group.members[0]?.id || '');
      })
      .catch((err) => toast.error(err.message));
  }, [groupId]);

  const members = group?.members ?? [];
  const total = Number(amount) || 0;
  const rate = currency === 'USD' ? 1 : rates[currency] || 0;
  const usdPreview = total * rate;
  const weightOf = (id) => Number(weights[id] ?? '1');

  const exactAssigned = members.reduce((s, m) => s + (Number(exactAmounts[m.id]) || 0), 0);
  const percentTotal = members.reduce((s, m) => s + (Number(percentages[m.id]) || 0), 0);
  const weightSum = members.reduce((s, m) => s + weightOf(m.id), 0);

  const step1Reason = useMemo(() => {
    if (!groupId) return 'Pick a group';
    if (!description.trim()) return 'Enter a description';
    if (!(total > 0)) return 'Enter an amount greater than 0';
    return null;
  }, [groupId, description, total]);

  const step2Reason = useMemo(() => {
    if (!members.length) return 'Group has no members';
    if (splitType === 'EXACT' && Math.abs(total - exactAssigned) > 0.01)
      return `Exact amounts must sum to ${formatMoney(total, currency)}`;
    if (splitType === 'PERCENTAGE' && Math.abs(100 - percentTotal) > 0.01)
      return 'Percentages must total 100%';
    if (splitType === 'WEIGHT' && members.some((m) => !(weightOf(m.id) > 0)))
      return 'Every weight must be greater than 0';
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, splitType, total, exactAssigned, percentTotal, weights, currency]);

  function go(next) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  function buildMembers() {
    return members.map((m) => {
      if (splitType === 'EXACT') return { userId: m.id, amount: Number(exactAmounts[m.id]) || 0 };
      if (splitType === 'PERCENTAGE') return { userId: m.id, percentage: Number(percentages[m.id]) || 0 };
      if (splitType === 'WEIGHT') return { userId: m.id, weight: weightOf(m.id) };
      return { userId: m.id };
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      await api.createExpense(groupId, {
        description,
        amount: total,
        currency,
        paidBy: paidById,
        splitType,
        members: buildMembers(),
      });
      setDone(true);
      toast.success('Expense added');
      setTimeout(() => {
        onSuccess?.(groupId);
        onClose?.();
      }, 900);
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className="flex flex-1 flex-col gap-1">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  n <= step ? 'bg-brand-500' : 'bg-border'
                )}
              />
              <span
                className={cn(
                  'text-xs',
                  n === step ? 'font-medium text-brand-400' : 'text-muted'
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && (
              <div className="space-y-4">
                {!initialGroupId && (
                  <select
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <option value="">Select a group…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex items-center justify-center gap-3 py-4">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-48 bg-transparent text-center text-5xl font-bold outline-none"
                  />
                  <CurrencySelect value={currency} onChange={setCurrency} codes={supportedCodes} />
                </div>

                {currency !== 'USD' && (
                  <div className="rounded-xl bg-brand-500/10 p-4 text-center text-sm">
                    <div className="text-2xl font-semibold text-brand-400">
                      ≈ {formatMoney(usdPreview, 'USD')} USD
                    </div>
                    <div className="mt-1 text-muted">
                      1 {currency} = {rate ? rate.toFixed(4) : '—'} USD
                      {ratesUpdatedAt &&
                        ` · updated ${formatDistanceToNow(new Date(ratesUpdatedAt), {
                          addSuffix: true,
                        })}`}
                    </div>
                  </div>
                )}

                <input
                  placeholder="What was this for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {SPLIT_CARDS.map((c) => {
                    const Icon = c.icon;
                    const active = splitType === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setSplitType(c.value)}
                        className={cn(
                          'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
                          active
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-border hover:border-border'
                        )}
                      >
                        <Icon size={20} className={active ? 'text-brand-400' : 'text-muted'} />
                        <span className="font-medium">{c.label}</span>
                        <span className="text-xs text-muted">{c.desc}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="block text-sm">
                  Paid by{' '}
                  <select
                    value={paidById}
                    onChange={(e) => setPaidById(e.target.value)}
                    className="ml-1 rounded-lg border border-border px-2 py-1"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {memberLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{m.name || m.email}</span>
                      {splitType === 'EXACT' && (
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={exactAmounts[m.id] ?? ''}
                          onChange={(e) =>
                            setExactAmounts((p) => ({ ...p, [m.id]: e.target.value }))
                          }
                          className="w-24 rounded-lg border border-border px-2 py-1 text-sm"
                        />
                      )}
                      {splitType === 'PERCENTAGE' && (
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={percentages[m.id] ?? ''}
                          onChange={(e) =>
                            setPercentages((p) => ({ ...p, [m.id]: e.target.value }))
                          }
                          className="w-20 rounded-lg border border-border px-2 py-1 text-sm"
                        />
                      )}
                      {splitType === 'WEIGHT' && (
                        <input
                          type="number"
                          step="1"
                          value={weights[m.id] ?? '1'}
                          onChange={(e) =>
                            setWeights((p) => ({ ...p, [m.id]: e.target.value }))
                          }
                          className="w-20 rounded-lg border border-border px-2 py-1 text-sm"
                        />
                      )}
                      {splitType === 'EQUAL' && (
                        <span className="text-xs text-muted">even share</span>
                      )}
                    </div>
                  ))}
                </motion.div>
                {step2Reason && (
                  <p className="text-sm text-danger">{step2Reason}</p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {done ? (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15"
                    >
                      <Check size={36} className="text-success" />
                    </motion.div>
                    <p className="font-medium">Added!</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border p-4">
                    <div className="text-3xl font-bold">
                      {formatMoney(total, currency)}{' '}
                      <span className="text-sm font-normal text-muted">{currency}</span>
                    </div>
                    {currency !== 'USD' && (
                      <div className="text-sm text-muted">
                        ≈ {formatMoney(usdPreview, 'USD')} USD
                      </div>
                    )}
                    <dl className="mt-3 space-y-1 text-sm">
                      <Row k="Group" v={group?.name} />
                      <Row k="Description" v={description} />
                      <Row
                        k="Paid by"
                        v={memberLabel(members.find((m) => m.id === paidById) || {})}
                      />
                      <Row k="Split" v={SPLIT_CARDS.find((c) => c.value === splitType)?.label} />
                      <Row k="Members" v={`${members.length}`} />
                    </dl>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav */}
      {!done && (
        <div className="mt-6 flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => go(step - 1)}>
              <ArrowLeft size={16} /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}

          {step < 3 && (
            <Button
              onClick={() => go(step + 1)}
              disabled={Boolean(step === 1 ? step1Reason : step2Reason)}
              disabledReason={step === 1 ? step1Reason : step2Reason}
            >
              Next <ArrowRight size={16} />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={submit} loading={submitting}>
              Add expense
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
