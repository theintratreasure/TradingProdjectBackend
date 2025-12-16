import { Router } from 'express';
import healthRoutes from './v1/health.routes.js';
import authRoutes from './v1/auth.routes.js';
import paymentRoutes from './v1/payment.routes.js';
import notificationRoutes from './v1/notification.routes.js';
import inquiryRoutes from './v1/inquiry.routes.js';
const router = Router();

router.use('/v1/health',healthRoutes);
router.use('/v1/notification', notificationRoutes);
router.use('/v1/payment-methods', paymentRoutes);
router.use('/v1/auth', authRoutes);
router.use('/inquiry', inquiryRoutes);
export default router;
