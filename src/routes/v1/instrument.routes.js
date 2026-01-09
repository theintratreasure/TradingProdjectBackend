import express from 'express';
import { createInstrument } from '../../controllers/instrument.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/**
 * POST /api/v1/instrument
 * Create new trading instrument
 */
router.post('/', authMiddleware,adminAuth, createInstrument);

export default router;
