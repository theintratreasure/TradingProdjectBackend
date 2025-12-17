import { Router } from 'express';
import { getMyProfile } from '../../controllers/user.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { updateMyProfile } from '../../controllers/user.controller.js';
const router = Router();

/**
 * GET /api/v1/user/me
 */
router.get('/me', authMiddleware, getMyProfile);
router.put('/me', authMiddleware, updateMyProfile);
export default router;
