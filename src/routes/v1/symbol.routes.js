import express from 'express';
import { bulkAddSymbols } from '../../controllers/symbol.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/**
 * BULK ADD SYMBOLS
 */
router.post('/bulk',  bulkAddSymbols);

export default router;
