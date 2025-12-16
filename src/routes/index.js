import { Router } from 'express';
import healthRoutes from './v1/health.routes.js';
import authRoutes from './v1/auth.routes.js';
import paymentRoutes from './v1/payment.routes.js';
const router = Router();

router.use('/v1/payment-methods', paymentRoutes);
router.use('/v1/health',healthRoutes);
router.use('/v1/auth', authRoutes);
export default router;
