import express from 'express';
import { createInstrument, deleteInstrument, getInstrument, searchInstrument, updateInstrument } from '../../controllers/instrument.controller.js';
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

// GET /api/v1/instrument/search?q=ABC&segment=FOREX&limit=20
router.get('/search', authMiddleware, adminAuth, searchInstrument);

// PUT /api/v1/instrument/:id
router.put('/:id', authMiddleware, adminAuth, updateInstrument);

// DELETE /api/v1/instrument/:id
router.delete('/:id', authMiddleware, adminAuth, deleteInstrument);

export default router;
