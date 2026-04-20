import express from 'express';
import { sendMailingBatch } from '../controllers/mailingController.js';
import {
  listUsers,
  getUserDetail,
  updateUserRole,
  updateUserBan,
  updateUserBalance,
  deleteUser,
  unlinkUserConnection,
  listCases,
  getCaseDetail,
  updateCase,
  listBattles,
  listInventory,
  listTransactions,
  listRtuLedgers,
  listRtuEvents,
  listSettings,
  upsertSetting,
  listAuditLogs,
  getOverview,
  getAnalytics,
  adjustRtu,
  setRtuLedgerExclusion,
  listFeedbackMessages,
  getFeedbackUnreadCount,
  updateFeedbackReadStatus,
  updateFeedbackStatus,
  previewBattleResolve,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  adminListRewardTasks,
  adminCreateRewardTask,
  adminUpdateRewardTask,
  adminDeleteRewardTask,
  adminListRewardClaims,
} from '../controllers/rewardController.js';

const router = express.Router();

router.use(requireAuth, requireRole(['ADMIN']));

router.get('/users', listUsers);
router.get('/users/:id', getUserDetail);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/ban', updateUserBan);
router.patch('/users/:id/balance', updateUserBalance);
router.delete('/users/:id', deleteUser);
router.delete('/users/:id/connections/:channel', unlinkUserConnection);

router.get('/cases', listCases);
router.get('/cases/:id', getCaseDetail);
router.patch('/cases/:id', updateCase);

router.get('/battles', listBattles);
router.get('/inventory', listInventory);
router.get('/transactions', listTransactions);

router.get('/rtu/ledgers', listRtuLedgers);
router.get('/rtu/events', listRtuEvents);
router.post('/rtu/adjust', adjustRtu);
router.patch('/rtu/ledgers/:id/exclusion', setRtuLedgerExclusion);

router.get('/settings', listSettings);
router.put('/settings/:key', upsertSetting);

router.get('/audit', listAuditLogs);
router.get('/overview', getOverview);
router.get('/analytics', getAnalytics);
router.get('/feedback', listFeedbackMessages);
router.get('/feedback/unread-count', getFeedbackUnreadCount);
router.patch('/feedback/:id/read', updateFeedbackReadStatus);
router.patch('/feedback/:id/status', updateFeedbackStatus);
router.post('/battles/preview-resolve', previewBattleResolve);

router.get('/rewards/tasks', adminListRewardTasks);
router.post('/rewards/tasks', adminCreateRewardTask);
router.patch('/rewards/tasks/:id', adminUpdateRewardTask);
router.delete('/rewards/tasks/:id', adminDeleteRewardTask);
router.get('/rewards/claims', adminListRewardClaims);

router.post('/mailing/batch', sendMailingBatch);

import {
  adminListPromoCodes,
  adminCreatePromoCode,
  adminUpdatePromoCode,
  adminDeletePromoCode,
  adminListPromoActivations,
} from '../controllers/promoController.js';

router.get('/promo', adminListPromoCodes);
router.post('/promo', adminCreatePromoCode);
router.patch('/promo/:id', adminUpdatePromoCode);
router.delete('/promo/:id', adminDeletePromoCode);
router.get('/promo/activations', adminListPromoActivations);

import {
  adminListRewardCases,
  adminGetRewardCase,
  adminCreateRewardCase,
  adminUpdateRewardCase,
  adminDeleteRewardCase,
  adminPublishRewardCase,
  adminPauseRewardCase,
  adminResumeRewardCase,
  adminCompleteRewardCase,
  adminRefundRewardCasePrePurchases,
  adminRewardCaseStats,
} from '../controllers/rewardCaseController.js';

router.get('/reward-cases', adminListRewardCases);
router.get('/reward-cases/stats', adminRewardCaseStats);
router.get('/reward-cases/:id', adminGetRewardCase);
router.post('/reward-cases', adminCreateRewardCase);
router.patch('/reward-cases/:id', adminUpdateRewardCase);
router.delete('/reward-cases/:id', adminDeleteRewardCase);
router.post('/reward-cases/:id/publish', adminPublishRewardCase);
router.post('/reward-cases/:id/pause', adminPauseRewardCase);
router.post('/reward-cases/:id/resume', adminResumeRewardCase);
router.post('/reward-cases/:id/complete', adminCompleteRewardCase);
router.post('/reward-cases/:id/refund-pre-purchases', adminRefundRewardCasePrePurchases);

export default router;
