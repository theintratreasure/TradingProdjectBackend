import express from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { saveDeviceToken } from '../../controllers/device.controller.js';

const router = express.Router();

router.post('/save-device-token', authMiddleware, saveDeviceToken);

export default router;
