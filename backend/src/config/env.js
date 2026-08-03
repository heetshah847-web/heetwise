import dotenv from 'dotenv';

dotenv.config();

// Centralized, validated access to environment variables.
// Nothing here is ever hardcoded — all values come from .env.
const required = ['DATABASE_URL', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
      'See .env.example.'
  );
}

export const env = {
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Allowed CORS origins. FRONTEND_URL may be a single origin OR a
  // comma-separated list (e.g. "https://heetwise.vercel.app,https://heetwise-wnkk.vercel.app")
  // so multiple deploy previews / domains are accepted. Falls back to
  // CLIENT_ORIGIN, then localhost for dev. Values are trimmed and de-duped.
  frontendUrls: [
    ...new Set(
      (
        process.env.FRONTEND_URL ||
        process.env.CLIENT_ORIGIN ||
        'http://localhost:5173'
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ],
  // First allowed origin — kept for anything that needs a single value.
  frontendUrl:
    (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',')[0]
      .trim(),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // Auth rate limit is configurable so tests can widen it; defaults match
  // the spec: 10 requests / 15 minutes / IP.
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  authRateLimitWindowMs:
    Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
};
