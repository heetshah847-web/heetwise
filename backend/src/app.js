import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import { requireAuth } from './middleware/auth.js';
import { me } from './controllers/authController.js';
import { getCurrencies, getRatesMeta } from './controllers/currencyController.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { sendSuccess } from './utils/response.js';

export function createApp() {
  const app = express();

  // Trust the proxy so rate limiting sees the real client IP in prod.
  app.set('trust proxy', 1);

  // CORS configured for the frontend origin with credentials (cookies).
  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // Health check.
  app.get('/health', (req, res) => sendSuccess(res, 200, { status: 'ok' }));

  // Auth routes (register, login, logout, me).
  app.use('/auth', authRoutes);

  // Top-level /me test endpoint that returns the current user from token.
  app.get('/me', requireAuth, me);

  // Smart-split domain: groups, members, expenses, balances.
  app.use('/groups', groupRoutes);

  // Multi-currency: available currencies + latest rates (display only).
  app.get('/currencies', requireAuth, getCurrencies);
  app.get('/rates', requireAuth, getRatesMeta);

  // 404 + centralized error handling.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
