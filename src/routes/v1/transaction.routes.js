import express from 'express';
import { adminGetUserTransactionHistory, adminListSwapDeductions, getUserTransactionHistory } from '../../controllers/transaction.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/**
 * GET /api/v1/transactions
 * Query:
 *  page
 *  limit
 *  accountId
 *  type
 *  status
 */
router.get('/', authMiddleware, getUserTransactionHistory);

// ADMIN: global swap deductions (today by default) with pagination + filters
router.get('/admin/swap', authMiddleware, adminAuth, adminListSwapDeductions);
router.get('/admin/:userId', authMiddleware, adminAuth, adminGetUserTransactionHistory);

export default router;
