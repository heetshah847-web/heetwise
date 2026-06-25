import { prisma } from '../lib/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
// rateService — the ONLY file permitted to reference the exchange-rate API key
// or call the external exchange-rate API. Everything else in the codebase reads
// rates from the database via getRate().
//
// Rates are stored as CUR -> USD multipliers, so converting an expense is just:
//   usdAmount = originalAmount * getRate(currency, 'USD')
// ─────────────────────────────────────────────────────────────────────────────

// The API key is a server-side-only secret. Missing it is a hard startup error.
const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
if (!API_KEY) {
  throw new Error(
    'EXCHANGE_RATE_API_KEY is not set. It is a required server-side secret; ' +
      'add it to backend/.env (see .env.example) before starting the server.'
  );
}

// Open Exchange Rates (free tier) — base USD. Fixer.io works equivalently.
const RATES_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`;
// Currencies we cache and offer in the UI. USD is the base.
const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD',
  'INR', 'CNY', 'CHF', 'MXN', 'BRL', 'SGD',
];

// Midnight-UTC date for "one rate per pair per day".
function utcDateOnly(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

// Fetch current rates from the external API and upsert them. Returns the number
// of rates stored. This is the ONLY function that hits the network.
export async function fetchAndStoreRates() {
  const res = await fetch(RATES_URL);
  if (!res.ok) {
    // Note: never include the URL/key in the thrown message.
    throw new Error(`Exchange rate API request failed with status ${res.status}`);
  }
  const data = await res.json();
  const usdRates = data?.conversion_rates ?? {};

  const now = new Date();
  const fetchedDate = utcDateOnly(now);
  let stored = 0;

  for (const currency of SUPPORTED_CURRENCIES) {
    // usdRates[CUR] is USD -> CUR; we store CUR -> USD (its inverse).
    const usdToCur = currency === 'USD' ? 1 : usdRates[currency];
    if (!usdToCur || usdToCur <= 0) continue;
    const curToUsd = currency === 'USD' ? 1 : 1 / usdToCur;

    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_fetchedDate: {
          fromCurrency: currency,
          toCurrency: 'USD',
          fetchedDate,
        },
      },
      update: { rate: curToUsd, fetchedAt: now },
      create: {
        fromCurrency: currency,
        toCurrency: 'USD',
        rate: curToUsd,
        fetchedAt: now,
        fetchedDate,
      },
    });
    stored += 1;
  }

  return stored;
}

// Look up the most recent cached rate for a currency pair. NEVER calls the
// external API — if nothing is cached it throws, telling the developer to run
// the sync job first.
export async function getRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;

  const row = await prisma.exchangeRate.findFirst({
    where: { fromCurrency, toCurrency },
    orderBy: { fetchedAt: 'desc' },
    select: { rate: true },
  });

  if (!row) {
    throw new Error(
      `No cached exchange rate for ${fromCurrency}->${toCurrency}. ` +
        'Run "npm run sync-rates" to populate the exchange_rates table first.'
    );
  }
  return Number(row.rate);
}
