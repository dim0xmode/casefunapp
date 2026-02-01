import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { topUpBalance, upgradeItem, recordBattle, chargeBattle } from '../controllers/userController.js';

const router = express.Router();

router.use(requireAuth);

router.post('/topup', topUpBalance);
router.post('/upgrade', upgradeItem);
router.post('/battles/charge', chargeBattle);
router.post('/battles/record', recordBattle);

export default router;
