import express from 'express';
import {
  getAllCases,
  getCaseById,
  createCase,
  openCase,
} from '../controllers/caseController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllCases);
router.get('/:id', getCaseById);
router.post('/', requireAuth, createCase);
router.post('/:caseId/open', requireAuth, openCase);

export default router;
