import express from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  topUpBalance,
  upgradeItem,
  recordBattle,
  chargeBattle,
  updateProfile,
  uploadAvatar,
  updateAvatarMeta,
  checkUsernameAvailability,
  createFeedbackMessage,
  getEarlyAccessRequestStatus,
  createBattleLobby,
  listBattleLobbies,
  joinBattleLobby,
  startBattleLobby,
  resolveBattle,
  finishBattleLobby,
  linkTelegramAccount,
  linkTelegramWebAccount,
  startTelegramBotLink,
  getTelegramBotLinkStatus,
  getTelegramBotInfo,
  unlinkTelegramAccount,
  getTwitterConnectUrl,
  linkTwitterAccount,
  unlinkTwitterAccount,
} from '../controllers/userController.js';
import { getReferralCode } from '../controllers/referralController.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

router.use(requireAuth);

router.post('/topup', requireRole(['ADMIN']), topUpBalance);
router.post('/upgrade', requireRole(['ADMIN', 'MODERATOR']), upgradeItem);
router.post('/battles/charge', requireRole(['ADMIN', 'MODERATOR']), chargeBattle);
router.post('/battles/record', requireRole(['ADMIN', 'MODERATOR']), recordBattle);
router.post('/battles/lobbies', requireRole(['ADMIN', 'MODERATOR']), createBattleLobby);
router.get('/battles/lobbies', requireRole(['ADMIN', 'MODERATOR']), listBattleLobbies);
router.post('/battles/lobbies/:lobbyId/join', requireRole(['ADMIN', 'MODERATOR']), joinBattleLobby);
router.post('/battles/lobbies/:lobbyId/start', requireRole(['ADMIN', 'MODERATOR']), startBattleLobby);
router.post('/battles/resolve', requireRole(['ADMIN', 'MODERATOR']), resolveBattle);
router.post('/battles/lobbies/:lobbyId/finish', requireRole(['ADMIN', 'MODERATOR']), finishBattleLobby);
router.patch('/profile', updateProfile);
router.post('/avatar', upload.single('file'), uploadAvatar);
router.patch('/avatar-meta', updateAvatarMeta);
router.get('/username/check', checkUsernameAvailability);
router.post('/telegram/link', linkTelegramAccount);
router.post('/telegram/link-web', linkTelegramWebAccount);
router.post('/telegram/link-bot/start', startTelegramBotLink);
router.get('/telegram/link-bot/status', getTelegramBotLinkStatus);
router.get('/telegram/bot-info', getTelegramBotInfo);
router.delete('/telegram/link', unlinkTelegramAccount);
router.get('/twitter/connect-url', getTwitterConnectUrl);
router.post('/twitter/link', linkTwitterAccount);
router.delete('/twitter/link', unlinkTwitterAccount);
router.post('/feedback', createFeedbackMessage);
router.get('/feedback/early-access/status', getEarlyAccessRequestStatus);
router.get('/referral/code', getReferralCode);

export default router;
