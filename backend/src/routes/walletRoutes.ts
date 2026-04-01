import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { confirmDeposit, getEthPrice, scanDeposit } from '../controllers/walletController.js';

const router = express.Router();

router.get('/price', getEthPrice);
router.post('/deposit/confirm', requireAuth, confirmDeposit);
router.post('/deposit/scan', requireAuth, scanDeposit);

export default router;
