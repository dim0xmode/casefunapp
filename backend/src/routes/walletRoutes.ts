import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  confirmDeposit,
  getEthPrice,
  scanDeposit,
  getTonPrice,
  getTonTreasuryAddress,
  confirmTonDeposit,
  scanTonDeposit,
} from '../controllers/walletController.js';

const router = express.Router();

router.get('/price', getEthPrice);
router.post('/deposit/confirm', requireAuth, confirmDeposit);
router.post('/deposit/scan', requireAuth, scanDeposit);

// TON deposit flow (mirrors EVM)
router.get('/ton/price', getTonPrice);
router.get('/ton/treasury', getTonTreasuryAddress);
router.post('/ton/deposit/confirm', requireAuth, confirmTonDeposit);
router.post('/ton/deposit/scan', requireAuth, scanTonDeposit);

export default router;
