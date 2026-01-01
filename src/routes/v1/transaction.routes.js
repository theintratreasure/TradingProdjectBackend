import express from 'express';
import { getUserTransactionHistory } from '../../controllers/transaction.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

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

export default router;
