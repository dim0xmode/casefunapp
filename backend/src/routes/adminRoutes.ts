import express from 'express';
import { sendMailingBatch } from '../controllers/mailingController.js';
import {
  listUsers,
  getUserDetail,
  updateUserRole,
  updateUserBan,
  updateUserBalance,
  deleteUser,
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

router.get('/cases', listCases);
router.get('/cases/:id', getCaseDetail);
router.patch('/cases/:id', updateCase);

router.get('/battles', listBattles);
router.get('/inventory', listInventory);
router.get('/transactions', listTransactions);

router.get('/rtu/ledgers', listRtuLedgers);
router.get('/rtu/events', listRtuEvents);
router.post('/rtu/adjust', adjustRtu);

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

export default router;
