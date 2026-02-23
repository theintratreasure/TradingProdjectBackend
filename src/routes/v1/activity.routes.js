import express from 'express';
import {
  adminListActivity,
  adminGetUserActivity,
  getMyActivity
} from '../../controllers/activity.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = express.Router();

// GET /api/v1/activity?limit=20&before=ISO_DATE
router.get('/', authMiddleware, getMyActivity);

// GET /api/v1/activity/admin?limit=20&before=ISO_DATE&action=...&userId=...&actorType=...
router.get('/admin', authMiddleware, adminAuth, adminListActivity);

// GET /api/v1/activity/admin/:userId?limit=20&before=ISO_DATE
router.get('/admin/:userId', authMiddleware, adminAuth, adminGetUserActivity);

export default router;
