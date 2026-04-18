import express from 'express';
import {
  getNonce,
  loginWithWallet,
  loginWithTelegram,
  loginWithTelegramDev,
  loginWithTelegramWidget,
  loginWithTon,
  linkTonWallet,
  confirmMerge,
  linkWalletToCurrentAccount,
  linkWalletFromTelegram,
  startTelegramWalletBrowserLink,
  claimTelegramWalletBrowserLink,
  startTelegramTopUpBrowserLink,
  claimTelegramTopUpBrowserLink,
  logout,
  getProfile,
} from '../controllers/authController.js';
import { completeTwitterLinkPublic } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/nonce', getNonce);
router.post('/login', loginWithWallet);
router.post('/telegram/login', loginWithTelegram);
router.post('/telegram/dev-login', loginWithTelegramDev);
router.post('/telegram/web-login', loginWithTelegramWidget);
router.post('/ton/login', loginWithTon);
router.post('/ton/link', requireAuth, linkTonWallet);
router.post('/merge/confirm', requireAuth, confirmMerge);
router.post('/wallet/link', requireAuth, linkWalletToCurrentAccount);
router.post('/telegram/wallet-link', requireAuth, linkWalletFromTelegram);
router.post('/telegram/wallet-link/start', requireAuth, startTelegramWalletBrowserLink);
router.get('/telegram/wallet-link/claim', claimTelegramWalletBrowserLink);
router.post('/telegram/topup-link/start', requireAuth, startTelegramTopUpBrowserLink);
router.get('/telegram/topup-link/claim', claimTelegramTopUpBrowserLink);
router.get('/twitter/callback', completeTwitterLinkPublic);
router.post('/twitter/callback', completeTwitterLinkPublic);
router.post('/logout', logout);
router.get('/profile', requireAuth, getProfile);

export default router;
