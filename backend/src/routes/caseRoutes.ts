import express from 'express';
import multer from 'multer';
import {
  getAllCases,
  getCaseById,
  createCase,
  openCase,
  uploadCaseImage,
  getActivityFeed,
} from '../controllers/caseController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/feed', getActivityFeed);
router.get('/', getAllCases);
router.get('/:id', getCaseById);
router.post('/upload', requireAuth, upload.single('file'), uploadCaseImage);
router.post('/', requireAuth, createCase);
router.post('/:caseId/open', requireAuth, openCase);

export default router;
