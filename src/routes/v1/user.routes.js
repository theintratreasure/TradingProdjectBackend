import { Router } from 'express';
import { adminGetUserProfile, adminListUsers, adminSearchUsers, adminUpdateUser, getMyProfile, saveFcmToken } from '../../controllers/user.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';
import { updateMyProfile } from '../../controllers/user.controller.js';
const router = Router();

/**
 * GET /api/v1/user/me
 */
router.get('/me', authMiddleware, getMyProfile);
router.put('/me', authMiddleware, updateMyProfile);
router.post("/save-fcm-token", authMiddleware, saveFcmToken);
router.get('/admin/search', authMiddleware, adminAuth, adminSearchUsers);
router.get('/admin/list', authMiddleware, adminAuth, adminListUsers);
router.get('/admin/:userId', authMiddleware, adminAuth, adminGetUserProfile);
router.patch('/admin/:userId', authMiddleware, adminAuth, adminUpdateUser);
export default router;
