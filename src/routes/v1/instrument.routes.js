import express from 'express';
import { createInstrument, deleteInstrument, getInstrument, updateInstrument } from '../../controllers/instrument.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

/**
 * POST /api/v1/instrument
 * Create new trading instrument
 */
router.post('/', authMiddleware,adminAuth, createInstrument);

// get api 
router.get('/', authMiddleware, adminAuth, getInstrument);

// PUT /api/v1/instrument/:id
router.put('/:id', authMiddleware, adminAuth, updateInstrument);

// DELETE /api/v1/instrument/:id
router.delete('/:id', authMiddleware, adminAuth, deleteInstrument);

export default router;
