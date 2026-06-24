import cron from 'node-cron';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { fetchAndStoreRates } from './services/rateService.js';

const app = createApp();

// Refresh exchange rates without crashing the server if the API is unreachable.
async function refreshRates(reason) {
  try {
    const count = await fetchAndStoreRates();
    console.log(`[rates] ${reason}: stored ${count} rates`);
  } catch (err) {
    // Log the message only — the API key never appears in rateService errors.
    console.error(`[rates] ${reason} failed: ${err.message}`);
  }
}

const server = app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);

  // Populate rates immediately so the table isn't empty for an hour.
  refreshRates('startup refresh');

  // Then refresh once an hour while the server runs.
  cron.schedule('0 * * * *', () => refreshRates('hourly refresh'));
});

// Graceful shutdown: disconnect Prisma and close the server.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
