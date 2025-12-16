import express from 'express';
import {
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  togglePaymentMethod,
  getAllPaymentMethods,
  getActivePaymentMethods
} from '../../controllers/payment.controller.js';

import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

// user only active routes 
router.get('/active',authMiddleware,getActivePaymentMethods);

/* ADMIN only */
router.get('/all',authMiddleware,adminAuth,getAllPaymentMethods);
router.post('/', authMiddleware, adminAuth, createPaymentMethod);
router.put('/:id', authMiddleware, adminAuth, updatePaymentMethod);
router.patch('/:id/status', authMiddleware, adminAuth, togglePaymentMethod);
router.delete('/:id', authMiddleware, adminAuth, deletePaymentMethod);

export default router;
