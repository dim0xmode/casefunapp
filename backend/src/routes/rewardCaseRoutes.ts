import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  listRewardCases,
  getRewardCase,
  postRewardCasePrePurchase,
  postRewardCaseOpen,
  getMyRewardInventory,
  claimRewardStack,
  claimRewardNft,
} from '../controllers/rewardCasePublicController.js';

const router = express.Router();

router.get('/', optionalAuth, listRewardCases);
router.get('/me/inventory', requireAuth, getMyRewardInventory);
router.get('/:id', optionalAuth, getRewardCase);
router.post('/:id/pre-purchase', requireAuth, postRewardCasePrePurchase);
router.post('/:id/open', requireAuth, postRewardCaseOpen);
router.post('/me/stacks/:stackId/claim', requireAuth, claimRewardStack);
router.post('/me/nfts/:nftId/claim', requireAuth, claimRewardNft);

export default router;
