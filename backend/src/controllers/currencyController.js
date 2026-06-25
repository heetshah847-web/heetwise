import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { ServiceUnavailableError } from '../utils/errors.js';
import { fetchAndStoreRates } from '../services/rateService.js';

// GET /currencies — distinct currencies that actually have cached rates, sorted.
// The frontend uses this to populate the currency dropdown (no hardcoded list).
export async function getCurrencies(req, res, next) {
  try {
    const rows = await prisma.exchangeRate.findMany({
      distinct: ['fromCurrency'],
      select: { fromCurrency: true },
    });
    const currencies = rows.map((r) => r.fromCurrency).sort();
    return sendSuccess(res, 200, { currencies });
  } catch (err) {
    return next(err);
  }
}

// GET /rates — the latest CUR->USD rate per currency plus the most recent
// fetch time. Powers the live "approximate USD" hint on the expense form and
// the "rates last updated" line on the balance screen. (Display only — the
// authoritative conversion always happens server-side at expense creation.)
export async function getRatesMeta(req, res, next) {
  try {
    const rows = await prisma.exchangeRate.findMany({
      where: { toCurrency: 'USD' },
      orderBy: { fetchedAt: 'desc' },
      select: { fromCurrency: true, rate: true, fetchedAt: true },
    });

    const rates = {};
    let updatedAt = null;
    for (const r of rows) {
      if (!(r.fromCurrency in rates)) rates[r.fromCurrency] = Number(r.rate);
      if (!updatedAt) updatedAt = r.fetchedAt;
    }
    return sendSuccess(res, 200, { rates, updatedAt });
  } catch (err) {
    return next(err);
  }
}

// POST /rates/sync — manual on-demand refresh of cached rates. Additive: it
// just calls the same fetchAndStoreRates the cron job uses (the only place that
// touches the external API). Returns how many were stored + the new timestamp.
export async function syncRatesNow(req, res, next) {
  try {
    const stored = await fetchAndStoreRates();
    const latest = await prisma.exchangeRate.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    return sendSuccess(res, 200, { stored, updatedAt: latest?.fetchedAt ?? null });
  } catch (err) {
    // Upstream API failure → 503, not a generic 500.
    return next(
      new ServiceUnavailableError('Could not refresh exchange rates right now.')
    );
  }
}
