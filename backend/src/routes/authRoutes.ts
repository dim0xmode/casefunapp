import express from 'express';
import {
  getNonce,
  loginWithWallet,
  loginWithTelegram,
  loginWithTelegramDev,
  linkWalletToCurrentAccount,
  linkWalletFromTelegram,
  startTelegramWalletBrowserLink,
  claimTelegramWalletBrowserLink,
  startTelegramTopUpBrowserLink,
  claimTelegramTopUpBrowserLink,
  logout,
  getProfile,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/nonce', getNonce);
router.post('/login', loginWithWallet);
router.post('/telegram/login', loginWithTelegram);
router.post('/telegram/dev-login', loginWithTelegramDev);
router.post('/wallet/link', requireAuth, linkWalletToCurrentAccount);
router.post('/telegram/wallet-link', requireAuth, linkWalletFromTelegram);
router.post('/telegram/wallet-link/start', requireAuth, startTelegramWalletBrowserLink);
router.get('/telegram/wallet-link/claim', claimTelegramWalletBrowserLink);
router.post('/telegram/topup-link/start', requireAuth, startTelegramTopUpBrowserLink);
router.get('/telegram/topup-link/claim', claimTelegramTopUpBrowserLink);
router.post('/logout', logout);
router.get('/profile', requireAuth, getProfile);

export default router;
