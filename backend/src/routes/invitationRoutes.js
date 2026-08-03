import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getPendingInvitations,
  acceptInvitation,
  declineInvitation,
} from '../controllers/invitationController.js';

// Top-level invitation routes (not nested under a group): the invitee acts on
// invitations addressed to their own email.
const router = Router();

router.use(requireAuth);

router.get('/pending', getPendingInvitations);
router.post('/:invitationId/accept', acceptInvitation);
router.post('/:invitationId/decline', declineInvitation);

export default router;
