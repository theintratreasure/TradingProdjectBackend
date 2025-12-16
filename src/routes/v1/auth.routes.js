import express from 'express';

import {
  signup,
  verifyOtp,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout
} from '../../controllers/auth.controller.js';

const router = express.Router();

// all auth routes prefixed with /api/v1/auth
router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
export default router;
