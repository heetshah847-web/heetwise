import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  signToken,
  verifyToken,
  AUTH_COOKIE,
  authCookieOptions,
} from '../utils/jwt.js';

const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shape a user record for the client (never leak the password hash).
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

// POST /auth/register — create a user with a bcrypt-hashed password.
export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body ?? {};

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }
    if (!EMAIL_REGEX.test(email)) {
      return sendError(res, 400, 'A valid email is required');
    }
    if (password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return sendError(res, 409, 'An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() || null,
      },
    });

    const token = signToken(user.id, user.tokenVersion);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());

    return sendSuccess(res, 201, { user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /auth/login — verify credentials and issue a JWT cookie.
export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Use a generic message to avoid revealing which accounts exist.
    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const token = signToken(user.id, user.tokenVersion);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());

    return sendSuccess(res, 200, { user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

// POST /auth/logout — clear the auth cookie AND bump the user's token version so
// the just-cleared JWT (and any copy of it) can never be reused. Best-effort:
// an already-invalid/absent token still clears the cookie cleanly.
export async function logout(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (token) {
      try {
        const payload = verifyToken(token);
        await prisma.user.update({
          where: { id: payload.sub },
          data: { tokenVersion: { increment: 1 } },
        });
      } catch {
        // Invalid/expired token — nothing to revoke; just clear the cookie.
      }
    }
    res.clearCookie(AUTH_COOKIE, { ...authCookieOptions(), maxAge: undefined });
    return sendSuccess(res, 200, { message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
}

// GET /auth/me — return the currently authenticated user.
export async function me(req, res, next) {
  try {
    return sendSuccess(res, 200, { user: publicUser(req.user) });
  } catch (err) {
    return next(err);
  }
}
