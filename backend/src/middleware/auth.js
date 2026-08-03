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
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      return sendError(res, 401, 'User no longer exists');
    }

    // Tokens issued before a logout carry an older version. Tokens issued before
    // this feature existed have no `ver` claim and are treated as version 0, so
    // existing sessions stay valid across the deploy.
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      return sendError(res, 401, 'Session expired, please log in again');
    }

    const { tokenVersion, ...safeUser } = user;
    req.user = safeUser;
    return next();
  } catch (err) {
    return next(err);
  }
}
