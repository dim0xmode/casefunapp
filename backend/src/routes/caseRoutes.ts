import express from 'express';
import multer from 'multer';
import {
  getAllCases,
  getCaseById,
  createCase,
  openCase,
  uploadCaseImage,
} from '../controllers/caseController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

router.get('/', getAllCases);
router.get('/:id', getCaseById);
router.post('/upload', requireAuth, requireRole(['ADMIN']), upload.single('file'), uploadCaseImage);
router.post('/', requireAuth, requireRole(['ADMIN']), createCase);
router.post('/:caseId/open', requireAuth, requireRole(['ADMIN']), openCase);

export default router;
