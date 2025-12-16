import User from '../models/User.model.js';
import Auth from '../models/Auth.model.js';
import Referral from '../models/Referral.model.js';
import Account from '../models/Account.model.js';
import Otp from '../models/Otp.model.js';
import {hashPassword,comparePassword,randomToken,sha256} from '../utils/hash.util.js';
import { generateOtp } from '../utils/otp.util.js';
import { sendOtpMail, sendResetPasswordMail} from '../utils/mail.util.js';
import { generateReferralCode } from '../utils/referralCode.util.js';
import { signAccessToken } from '../utils/jwt.util.js';

/* ======================================================
   SIGNUP
====================================================== */

export async function signupService({
  email, phone, name, password, confirmPassword, signup_ip, referral_code}) {
  if (!password || password !== confirmPassword) {
    throw new Error('Password and confirm password do not match');
  }

  try {
    const user = await User.create({
      email,
      phone,
      name,
      signup_ip,
      status: 'PENDING',
      userType: 'USER'
    });

    const passwordHash = await hashPassword(password);
    await Auth.create({
      user_id: user._id,
      password_hash: passwordHash
    });

    let referredBy = null;
    if (referral_code) {
      const parent = await Referral.findOne(
        { referral_code },
        { user_id: 1 }
      );
      if (parent) referredBy = parent.user_id;
    }

    await Referral.create({
      user_id: user._id,
      referral_code: generateReferralCode(),
      referred_by: referredBy,
      status: 'PENDING'
    });

    const otp = generateOtp();
    await Otp.create({
      user_id: user._id,
      otp,
      expires_at: new Date(Date.now() + 10 * 60 * 1000)
    });

    sendOtpMail(email, otp).catch(() => {});

    return {
      user_id: user._id,
      message: 'Signup successful, OTP sent'
    };
  } catch (err) {
    if (err?.code === 11000) {
      throw new Error('Email or phone already exists');
    }
    throw err;
  }
}

/* ======================================================
   VERIFY OTP
====================================================== */

export async function verifyOtpService({ email, otp }) {
  const user = await User.findOne(
    { email },
    { _id: 1, status: 1 }
  );
  if (!user) throw new Error('User not found');

  const otpDoc = await Otp.findOne({
    user_id: user._id,
    otp,
    used: false
  }).sort({ createdAt: -1 });

  if (!otpDoc) throw new Error('Invalid OTP');
  if (otpDoc.expires_at < new Date()) throw new Error('OTP expired');

  Otp.updateOne(
    { _id: otpDoc._id },
    { $set: { used: true } }
  ).catch(() => {});

  await User.updateOne(
    { _id: user._id },
    { $set: { status: 'ACTIVE' } }
  );

  Account.create({
    user_id: user._id,
    type: 'DEMO',
    balance: 10000
  }).catch(() => {});

  return {
    user_id: user._id,
    message: 'Account verified successfully'
  };
}

/* ======================================================
   LOGIN
====================================================== */

export async function loginService({ email, password, ip, device }) {
  //  Find user
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) throw new Error('Invalid credentials');

  //  Find auth record
  const auth = await Auth.findOne({ user_id: user._id });
  if (!auth) throw new Error('Invalid credentials');

  //  Check password
  const ok = await comparePassword(password, auth.password_hash);
  if (!ok) {
    await Auth.updateOne(
      { _id: auth._id },
      { $inc: { login_attempts: 1 } }
    );
    throw new Error('Invalid credentials');
  }

  //  Generate refresh token
  const refreshToken = randomToken();

  // Update auth info
  await Auth.updateOne(
    { _id: auth._id },
    {
      $set: {
        login_attempts: 0,
        last_login_at: new Date(),
        last_login_ip: ip,
        last_login_device: device,

        refresh_token_hash: sha256(refreshToken),
        refresh_token_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
        ),
        refresh_token_ip: ip,
        refresh_token_device: device
      }
    }
  );

  //  Return tokens
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
}

/* ======================================================
   FORGOT PASSWORD (LINK)
====================================================== */

export async function forgotPasswordService(email) {
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) return;

  const auth = await Auth.findOne({ user_id: user._id });
  if (!auth) return;

  const token = randomToken();

  await Auth.updateOne(
    { _id: auth._id },
    {
      $set: {
        reset_token_hash: sha256(token),
        reset_token_expires_at: new Date(
          Date.now() + 10 * 60 * 1000
        )
      }
    }
  );

  sendResetPasswordMail(
    user.email,
    `${process.env.FRONTEND_URL}/reset-password?token=${token}`
  ).catch(() => {});
}

/* ======================================================
   RESET PASSWORD
====================================================== */

export async function resetPasswordService(token, newPassword) {
  const auth = await Auth.findOne({
    reset_token_hash: sha256(token),
    reset_token_expires_at: { $gt: new Date() }
  });

  if (!auth) throw new Error('Invalid or expired token');

  const passwordHash = await hashPassword(newPassword);

  await Auth.updateOne(
    { _id: auth._id },
    {
      $set: { password_hash: passwordHash },
      $unset: {
        reset_token_hash: 1,
        reset_token_expires_at: 1
      }
    }
  );
}
export async function refreshTokenService({ refreshToken, ip, device }) {
  const auth = await Auth.findOne({
    refresh_token_hash: sha256(refreshToken),
    refresh_token_expires_at: { $gt: new Date() }
  });

  if (!auth) throw new Error('Invalid or expired refresh token');

  const user = await User.findById(auth.user_id).lean();
  if (!user) throw new Error('User not found');

  const newRefreshToken = randomToken();

  await Auth.updateOne(
    { _id: auth._id },
    {
      $set: {
        refresh_token_hash: sha256(newRefreshToken),
        refresh_token_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ),
        refresh_token_ip: ip,
        refresh_token_device: device
      }
    }
  );

  return {
    accessToken: signAccessToken(user),
    refreshToken: newRefreshToken
  };
}

/* ================= LOGOUT ================= */

export async function logoutService({ refreshToken }) {
  if (!refreshToken) {
    throw new Error('Refresh token required');
  }

  const result = await Auth.updateOne(
    { refresh_token_hash: sha256(refreshToken) },
    {
      $set: {
        refresh_token_hash: null,
        refresh_token_expires_at: null,
        refresh_token_ip: null,
        refresh_token_device: null
      }
    }
  );

  if (result.matchedCount === 0) {
    throw new Error('Invalid refresh token');
  }
}
