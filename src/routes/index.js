import { Router } from 'express';
import healthRoutes from './v1/health.routes.js';
import authRoutes from './v1/auth.routes.js';
import paymentRoutes from './v1/payment.routes.js';
import notificationRoutes from './v1/notification.routes.js';
import inquiryRoutes from './v1/inquiry.routes.js';
import userRoutes from './v1/user.routes.js';
import kycRoutes from './v1/kyc.routes.js';
import holidayRoutes from './v1/holiday.routes.js';
const router = Router();

router.use('/v1/health',healthRoutes);
router.use('/v1/notification', notificationRoutes);
router.use('/v1/payment-methods', paymentRoutes);
router.use('/v1/auth', authRoutes);
router.use('/v1/inquiry', inquiryRoutes);
router.use('/v1/user', userRoutes);
router.use('/v1/kyc', kycRoutes);
router.use('/v1/holidays', holidayRoutes);

export default router;
