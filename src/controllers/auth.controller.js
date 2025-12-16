import {
  signupService,
  verifyOtpService,
  loginService,
  forgotPasswordService,
  resetPasswordService,
  refreshTokenService,
  logoutService
} from '../services/auth.service.js';

/* ================= SIGNUP ================= */

export async function signup(req, res) {
  try {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.socket?.remoteAddress ||
      null;

    const data = await signupService({
      ...req.body,
      signup_ip: ip
    });

    res.status(201).json({
      success: true,
      data
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message
    });
  }
}

/* ================= VERIFY OTP ================= */

export async function verifyOtp(req, res) {
  try {
    const data = await verifyOtpService(req.body);

    res.json({
      success: true,
      data
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message
    });
  }
}

/* ================= LOGIN ================= */

export async function login(req, res) {
  try {
    const { email, password, fcmToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const { accessToken, refreshToken } = await loginService({
      email,
      password,
      ip: req.ip,
      device: req.headers['user-agent'] || null,
      fcmToken // 🔔 optional
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken
      }
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
}


/* ================= FORGOT PASSWORD ================= */

export async function forgotPassword(req, res) {
  try {
    await forgotPasswordService(req.body.email);

    res.json({
      success: true
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message
    });
  }
}

/* ================= RESET PASSWORD ================= */

export async function resetPassword(req, res) {
  try {
    await resetPasswordService(
      req.body.token,
      req.body.password
    );

    res.json({
      success: true
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message
    });
  }
}

/* ================= REFRESH TOKEN ================= */

export async function refreshToken(req, res) {
  try {
    const data = await refreshTokenService({
      refreshToken: req.body.refreshToken,
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.json({ success: true, data });
  } catch (e) {
    res.status(401).json({ success: false, message: e.message });
  }
}

/* ================= LOGOUT ================= */

export async function logout(req, res) {
  try {
    await logoutService({
      refreshToken: req.body.refreshToken
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}