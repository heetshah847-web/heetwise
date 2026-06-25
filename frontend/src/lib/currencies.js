// Static currency metadata (matches the backend's SUPPORTED_CURRENCIES) plus
// formatting helpers so every amount looks consistent across the app:
// symbol BEFORE the number, comma thousands, 2 decimals, code in muted text after.

export const CURRENCIES = {
  USD: { name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  EUR: { name: 'Euro', symbol: '€', flag: '🇪🇺' },
  GBP: { name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  JPY: { name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  CAD: { name: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦' },
  AUD: { name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
  INR: { name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  CNY: { name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  CHF: { name: 'Swiss Franc', symbol: 'Fr', flag: '🇨🇭' },
  MXN: { name: 'Mexican Peso', symbol: 'MX$', flag: '🇲🇽' },
  BRL: { name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  SGD: { name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
};

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCIES);

export function currencyMeta(code) {
  return CURRENCIES[code] || { name: code, symbol: '', flag: '🏳️' };
}

export function symbolFor(code) {
  return currencyMeta(code).symbol;
}

// 1234.5 -> "1,234.50"
export function formatNumber(amount) {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Plain string form: "$1,234.50" (no currency code suffix). For the JSX form
// with a muted code suffix, use the <Money /> component.
export function formatMoney(amount, code = 'USD') {
  return `${symbolFor(code)}${formatNumber(amount)}`;
}
