import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Search, ChevronDown, Check } from 'lucide-react';
import { CURRENCIES, currencyMeta } from '../lib/currencies.js';
import { cn } from '../lib/cn.js';

// Searchable currency dropdown showing flag, code, and full name.
// `codes` limits which currencies are offered (defaults to all known).
export default function CurrencySelect({ value, onChange, codes }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const list = (codes && codes.length ? codes : Object.keys(CURRENCIES)).filter(
    (code) => {
      const m = currencyMeta(code);
      const q = query.trim().toLowerCase();
      return !q || code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    }
  );

  const sel = currencyMeta(value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300
                     bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          <span className="text-lg leading-none">{sel.flag}</span>
          <span className="font-medium">{value}</span>
          <ChevronDown size={16} className="text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2">
            <Search size={16} className="text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search currency…"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {list.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-slate-400">
                No matches
              </p>
            )}
            {list.map((code) => {
              const m = currencyMeta(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    onChange(code);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100',
                    code === value && 'bg-brand-50'
                  )}
                >
                  <span className="text-xl leading-none">{m.flag}</span>
                  <span className="font-medium">{code}</span>
                  <span className="flex-1 truncate text-slate-500">{m.name}</span>
                  {code === value && <Check size={16} className="text-brand-600" />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
