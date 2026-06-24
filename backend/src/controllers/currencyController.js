import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';

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
