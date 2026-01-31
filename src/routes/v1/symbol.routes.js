import express from 'express';
import { bulkAddSymbols, getSymbols } from '../../controllers/symbol.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/**
 * GET SYMBOL LIST (ADMIN ONLY)
 */
router.get('/list', authMiddleware, adminAuth, getSymbols);

/**
 * BULK ADD SYMBOLS
 */
router.post('/bulk',  bulkAddSymbols);

export default router;
