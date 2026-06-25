import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Search, RefreshCw, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { currencyMeta, formatNumber } from '../lib/currencies.js';
import CurrencySelect from '../components/CurrencySelect.jsx';
import Button from '../components/Button.jsx';
import { cn } from '../lib/cn.js';

export default function Currencies() {
  const [codes, setCodes] = useState([]);
  const [rates, setRates] = useState({}); // CUR -> USD
  const [updatedAt, setUpdatedAt] = useState(null);
  const [base, setBase] = useState('USD');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Converter
  const [left, setLeft] = useState({ code: 'USD', amount: '1' });
  const [right, setRight] = useState({ code: 'INR', amount: '' });
  const [swung, setSwung] = useState(false);

  async function loadRates() {
    const [c, r] = await Promise.all([api.listCurrencies(), api.getRates()]);
    setCodes(c.currencies);
    setRates(r.rates || {});
    setUpdatedAt(r.updatedAt || null);
  }

  useEffect(() => {
    loadRates().catch((err) => toast.error(err.message));
  }, []);

  // units of `code` per 1 `base`  =  rates[base] / rates[code]
  const perBase = (code) =>
    rates[base] && rates[code] ? rates[base] / rates[code] : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return codes.filter((code) => {
      const m = currencyMeta(code);
      return !q || code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [codes, query]);

  const maxPerBase = Math.max(
    1,
    ...visible.map((c) => perBase(c) || 0).filter((v) => Number.isFinite(v))
  );

  // Convert between the two converter inputs using CUR->USD rates.
  function convert(amount, from, to) {
    if (!rates[from] || !rates[to]) return '';
    return ((Number(amount) || 0) * (rates[from] / rates[to])).toFixed(2);
  }

  function onLeft(amount) {
    setLeft((p) => ({ ...p, amount }));
    setRight((p) => ({ ...p, amount: convert(amount, left.code, p.code) }));
  }
  function onRight(amount) {
    setRight((p) => ({ ...p, amount }));
    setLeft((p) => ({ ...p, amount: convert(amount, right.code, p.code) }));
  }
  function swap() {
    setSwung((s) => !s);
    setLeft(right);
    setRight(left);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await api.syncRates();
      setUpdatedAt(res.updatedAt);
      await loadRates();
      toast.success(`Refreshed ${res.stored} rates`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  const baseMeta = currencyMeta(base);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <Link to="/" className="text-sm text-brand-600">
        ← Dashboard
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{baseMeta.flag}</span>
          <div>
            <h1 className="text-2xl font-bold">Exchange rates</h1>
            <p className="text-sm text-slate-500">
              Base currency: {baseMeta.name}
            </p>
          </div>
        </div>
        <CurrencySelect value={base} onChange={setBase} codes={codes} />
      </div>

      {/* Search */}
      <div className="mt-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
        <Search size={18} className="text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or code…"
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
      </div>

      {/* Rate cards */}
      {visible.length === 0 ? (
        <p className="mt-8 text-center text-slate-400">
          No cached rates yet — hit refresh below.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((code) => {
            const m = currencyMeta(code);
            const value = perBase(code);
            const pct = value ? Math.min(100, (value / maxPerBase) * 100) : 0;
            return (
              <motion.div
                key={code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{m.flag}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{code}</div>
                    <div className="text-xs text-slate-500">{m.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">
                      {value ? formatNumber(value) : '—'}
                    </div>
                    <div className="text-[10px] text-slate-400">per 1 {base}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-brand-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Converter */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Converter</h2>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <ConverterInput
            side={left}
            onAmount={onLeft}
            onCode={(code) => {
              setLeft((p) => ({ ...p, code }));
              setRight((p) => ({ ...p, amount: convert(left.amount, code, p.code) }));
            }}
            codes={codes}
          />
          <motion.button
            type="button"
            onClick={swap}
            animate={{ rotate: swung ? 180 : 0 }}
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full
                       border border-slate-300 bg-white hover:bg-slate-50"
            aria-label="Swap currencies"
          >
            <ArrowLeftRight size={18} />
          </motion.button>
          <ConverterInput
            side={right}
            onAmount={onRight}
            onCode={(code) => {
              setRight((p) => ({ ...p, code }));
              setLeft((p) => ({ ...p, amount: convert(right.amount, code, p.code) }));
            }}
            codes={codes}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {updatedAt
              ? `Rates updated ${formatDistanceToNow(new Date(updatedAt), {
                  addSuffix: true,
                })}`
              : 'No rate data yet'}
          </span>
          <Button variant="secondary" onClick={refresh} loading={refreshing}>
            <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConverterInput({ side, onAmount, onCode, codes }) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-300 p-2">
      <input
        type="number"
        value={side.amount}
        onChange={(e) => onAmount(e.target.value)}
        placeholder="0.00"
        className="w-full bg-transparent px-1 text-lg outline-none"
      />
      <CurrencySelect value={side.code} onChange={onCode} codes={codes} />
    </div>
  );
}
