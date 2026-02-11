import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { claimToken } from '../controllers/tokenController.js';

const router = express.Router();

router.post('/claim', requireAuth, claimToken);

export default router;
