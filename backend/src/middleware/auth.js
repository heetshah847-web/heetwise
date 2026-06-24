import { verifyToken, AUTH_COOKIE } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';
import { prisma } from '../lib/prisma.js';

// Protected-route middleware: reads the JWT from the httpOnly cookie,
// verifies it, loads the user, and attaches it to req.user.
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) {
      return sendError(res, 401, 'Authentication required');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return sendError(res, 401, 'Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      return sendError(res, 401, 'User no longer exists');
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
