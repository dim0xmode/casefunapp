import express from 'express';
import {
  listUsers,
  getUserDetail,
  updateUserRole,
  updateUserBan,
  updateUserBalance,
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
  adjustRtu,
  listFeedbackMessages,
  getFeedbackUnreadCount,
  updateFeedbackReadStatus,
  previewBattleResolve,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireRole(['ADMIN']));

router.get('/users', listUsers);
router.get('/users/:id', getUserDetail);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/ban', updateUserBan);
router.patch('/users/:id/balance', updateUserBalance);

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
router.get('/feedback', listFeedbackMessages);
router.get('/feedback/unread-count', getFeedbackUnreadCount);
router.patch('/feedback/:id/read', updateFeedbackReadStatus);
router.post('/battles/preview-resolve', previewBattleResolve);

export default router;
