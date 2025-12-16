import express from 'express';
import {
  createInquiry,
  getInquiries
} from '../../controllers/inquiry.controller.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * USER
 */
router.post('/', createInquiry);

/**
 * ADMIN
 */
router.get('/', authMiddleware,adminAuth, getInquiries);

export default router;
