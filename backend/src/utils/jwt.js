import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Sign a JWT carrying the user id as the subject and the user's current token
// version. requireAuth rejects the token if the stored version has moved on
// (i.e. the user has since logged out), which is how a copied token is revoked.
export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, ver: tokenVersion }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

// Verify a JWT and return its decoded payload, or throw if invalid.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

// Name of the cookie that stores the JWT.
export const AUTH_COOKIE = 'token';

// Cookie options: httpOnly so JS can never read it (never localStorage).
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}
