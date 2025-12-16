import express from 'express';

import {
  signup,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  verifyEmail,
  resendVerifyEmail
} from '../../controllers/auth.controller.js';

const router = express.Router();

// all auth routes prefixed with /api/v1/auth
router.post('/signup', signup);
router.post('/verify-email', verifyEmail);
router.post('/resend-verify-email', resendVerifyEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
export default router;
