// Shared chart colors + formatting helpers so the stats pages share one look.

// App color scheme used for all charts (not Recharts defaults).
export const COLORS = [
  '#4f46e5', // indigo
  '#059669', // green
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#db2777', // pink
  '#65a30d', // lime
];

export const POSITIVE = '#059669';
export const NEGATIVE = '#dc2626';

// All monetary values: 2 decimals, USD prefix.
export const formatUSD = (n) => `$${Number(n || 0).toFixed(2)}`;

// { year, month } -> "Jan '24"
export function monthLabel({ year, month }) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const m = d.toLocaleString('en-US', { month: 'short' });
  return `${m} '${String(year).slice(2)}`;
}
