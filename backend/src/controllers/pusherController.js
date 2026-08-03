import { prisma } from '../lib/prisma.js';
import { sendError } from '../utils/response.js';
import { authorizeChannel } from '../services/pusherService.js';

// POST /pusher/auth — pusher-js calls this before subscribing to a PRIVATE
// channel. We only sign the subscription if the authenticated user is actually
// allowed on that channel:
//   private-user-<id>   → only that user
//   private-group-<id>  → only a member of the group
// Anything else is refused, which is what stops a stranger who guesses an id
// from listening to expense/settlement events.
export async function authenticatePusher(req, res, next) {
  try {
    const socketId = req.body?.socket_id;
    const channel = req.body?.channel_name;
    if (!socketId || !channel) {
      return sendError(res, 400, 'socket_id and channel_name are required');
    }

    const userMatch = /^private-user-(.+)$/.exec(channel);
    const groupMatch = /^private-group-(.+)$/.exec(channel);

    let allowed = false;
    if (userMatch) {
      allowed = userMatch[1] === req.user.id;
    } else if (groupMatch) {
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: groupMatch[1], userId: req.user.id },
        },
      });
      allowed = Boolean(membership);
    }

    if (!allowed) {
      return sendError(res, 403, 'Not allowed to subscribe to this channel');
    }

    const authResponse = authorizeChannel(socketId, channel);
    if (!authResponse) {
      // Pusher isn't configured server-side; nothing to sign.
      return sendError(res, 503, 'Real-time is not configured');
    }
    return res.status(200).json(authResponse);
  } catch (err) {
    return next(err);
  }
}
