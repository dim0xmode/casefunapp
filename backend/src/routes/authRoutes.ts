import express from 'express';
import { getNonce, loginWithWallet, logout, getProfile } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/nonce', getNonce);
router.post('/login', loginWithWallet);
router.post('/logout', logout);
router.get('/profile', requireAuth, getProfile);

export default router;
