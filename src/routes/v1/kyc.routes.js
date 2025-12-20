import express from 'express';
import {
  submitKyc,
  getMyKyc,
  getAllKycs,
  updateKycStatus
} from '../../controllers/kyc.controller.js';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/* USER */
router.post('/', authMiddleware, submitKyc);
router.get('/me', authMiddleware, getMyKyc);

/* ADMIN */
router.get('/admin', authMiddleware, adminAuth, getAllKycs);
router.put(
  '/admin/:kycId/status',
  authMiddleware,
  adminAuth,
  updateKycStatus
);

export default router;
