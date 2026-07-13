import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { claimToken, getClaimStatus } from '../controllers/tokenController.js';

const router = express.Router();

router.post('/claim', requireAuth, claimToken);
router.get('/claim/status/:caseId', requireAuth, getClaimStatus);

export default router;
