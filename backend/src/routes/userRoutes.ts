import express from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { topUpBalance, upgradeItem, recordBattle, chargeBattle, updateProfile, uploadAvatar, updateAvatarMeta, checkUsernameAvailability } from '../controllers/userController.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

router.use(requireAuth);

router.post('/topup', requireRole(['ADMIN', 'MODERATOR']), topUpBalance);
router.post('/upgrade', requireRole(['ADMIN', 'MODERATOR']), upgradeItem);
router.post('/battles/charge', requireRole(['ADMIN', 'MODERATOR']), chargeBattle);
router.post('/battles/record', requireRole(['ADMIN', 'MODERATOR']), recordBattle);
router.patch('/profile', updateProfile);
router.post('/avatar', upload.single('file'), uploadAvatar);
router.patch('/avatar-meta', updateAvatarMeta);
router.get('/username/check', checkUsernameAvailability);

export default router;
