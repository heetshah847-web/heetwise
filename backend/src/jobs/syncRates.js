// Standalone script for a cron scheduler (or manual `npm run sync-rates`).
// Populates the exchange_rates table, then exits.
import { fetchAndStoreRates } from '../services/rateService.js';
import { prisma } from '../lib/prisma.js';

async function main() {
  const count = await fetchAndStoreRates();
  console.log(`[syncRates] stored ${count} rates at ${new Date().toISOString()}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    // Log the message only — never the API key or full request URL.
    console.error(`[syncRates] failed: ${err.message}`);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
