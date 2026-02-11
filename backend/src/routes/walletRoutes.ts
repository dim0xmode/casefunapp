import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { confirmDeposit, getEthPrice } from '../controllers/walletController.js';

const router = express.Router();

router.get('/price', getEthPrice);
router.post('/deposit/confirm', requireAuth, confirmDeposit);

export default router;
