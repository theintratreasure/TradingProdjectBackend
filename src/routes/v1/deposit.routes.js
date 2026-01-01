import express from 'express';
import {
  createDeposit,
  getMyDeposits,
  getDepositStatus,
  adminGetAllDeposits,
  adminApproveDeposit,
  adminRejectDeposit
} from "../../controllers/deposit.controller.js";
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/* USER */
router.post('/', authMiddleware, createDeposit);
router.get('/my',authMiddleware , getMyDeposits);
router.get('/:id/status', authMiddleware, getDepositStatus);

/* ADMIN */
router.get('/admin/all', authMiddleware,adminAuth, adminGetAllDeposits);
router.post('/admin/:id/approve', authMiddleware,adminAuth, adminApproveDeposit);
router.post('/admin/:id/reject', authMiddleware,adminAuth, adminRejectDeposit);

export default router;
