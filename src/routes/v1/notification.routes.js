import express from 'express';
import { adminBroadcastNotification } from '../../controllers/notification.controller.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
const router = express.Router();

router.post('/admin/broadcast',authMiddleware, adminAuth,adminBroadcastNotification);

export default router;
