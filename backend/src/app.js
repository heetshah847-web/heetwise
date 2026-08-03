import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import statsRoutes from './routes/stats.js';
import invitationRoutes from './routes/invitationRoutes.js';
import balanceRoutes from './routes/balanceRoutes.js';
import { requireAuth } from './middleware/auth.js';
import { me } from './controllers/authController.js';
import {
  getNotifications,
  subscribePush,
  sendReminders,
} from './controllers/notificationController.js';
import {
  getCurrencies,
  getRatesMeta,
  syncRatesNow,
} from './controllers/currencyController.js';
import { authenticatePusher } from './controllers/pusherController.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/response.js';

export function createApp() {
  const app = express();

  // Trust the proxy so rate limiting sees the real client IP in prod.
  app.set('trust proxy', 1);

  // helmet first: sets X-Frame-Options, X-Content-Type-Options, HSTS,
  // X-XSS-Protection, Content-Security-Policy, etc. with zero config.
  app.use(helmet());

  // CORS locked to the allowed frontend origins (FRONTEND_URL, which may be a
  // comma-separated list). Requests with no Origin header (server-to-server,
  // curl, tests) are allowed; any other browser origin is rejected (mapped to
  // 403 in the error handler).
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.frontendUrls.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // Health check. Also issues a trivial query so a periodic ping (e.g. a Vercel
  // cron or uptime monitor) keeps the serverless DB pool warm and mitigates
  // cold-start latency after idle. DB errors don't fail the check.
  app.get('/health', async (req, res) => {
    let db = 'unknown';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'unreachable';
    }
    return sendSuccess(res, 200, { status: 'ok', db });
  });

  // Auth routes (register, login, logout, me).
  app.use('/auth', authRoutes);

  // Top-level /me test endpoint that returns the current user from token.
  app.get('/me', requireAuth, me);

  // Smart-split domain: groups, members, expenses, balances, settlements.
  app.use('/groups', groupRoutes);

  // Group invitations (invitee-facing): list pending, accept, decline.
  app.use('/invitations', invitationRoutes);

  // Cross-group balance summary for the current user.
  app.use('/balances', balanceRoutes);

  // Pusher private-channel authorization (subscribe-time membership check).
  app.post('/pusher/auth', requireAuth, authenticatePusher);

  // Notifications: unsettled debts older than 7 days for the current user.
  app.get('/notifications', requireAuth, getNotifications);
  // Save a browser Web Push subscription for the current user.
  app.post('/notifications/subscribe', requireAuth, subscribePush);
  // Daily reminder sweep — hit by the Vercel cron (unauthenticated by design).
  app.get('/notifications/send-reminders', sendReminders);

  // Multi-currency: available currencies + latest rates (display only).
  app.get('/currencies', requireAuth, getCurrencies);
  app.get('/rates', requireAuth, getRatesMeta);
  app.post('/rates/sync', requireAuth, syncRatesNow);

  // Statistics / aggregation module (cached).
  app.use('/stats', statsRoutes);

  // 404 + centralized error handling.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Default export for Vercel serverless: a ready-to-use Express app instance.
const app = createApp();
export default app;
