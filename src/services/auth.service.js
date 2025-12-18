import User from '../models/User.model.js';
import Auth from '../models/Auth.model.js';
import Referral from '../models/Referral.model.js';
import Account from '../models/Account.model.js';
import Otp from '../models/Otp.model.js';
import { hashPassword, comparePassword, randomToken, sha256 } from '../utils/hash.util.js';
import { sendEmailVerificationMail, sendResetPasswordMail } from '../utils/mail.util.js';
import { generateReferralCode } from '../utils/referralCode.util.js';
import { signAccessToken } from '../utils/jwt.util.js';
import UserDevice from '../models/UserDevice.model.js'
import admin from '../config/firebase.js'
import UserProfile from '../models/UserProfile.model.js';
/* ======================================================
   SIGNUP
====================================================== */

export async function signupService({
    email,
    phone,
    name,
    password,
    confirmPassword,
    signup_ip,
    referral_code
}) {
    if (!password || password !== confirmPassword) {
        throw new Error('Password and confirm password do not match');
    }

    try {
        // 1️⃣ Create user
        const user = await User.create({
            email: email.toLowerCase(),
            phone,
            name,
            signup_ip,
            userType: 'USER',
            isMailVerified: false
        });

        // 2️⃣ Auth (password)
        const passwordHash = await hashPassword(password);

        const token = randomToken();

        await Auth.create({
            user_id: user._id,
            password_hash: passwordHash,
            email_verify_token_hash: sha256(token),
            email_verify_token_expires_at: new Date(
                Date.now() + 24 * 60 * 60 * 1000 // 24 hours
            )
        });

        // 3️⃣ Referral
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

        // 4️⃣ Send email confirmation link
        sendEmailVerificationMail(
            user.email,
            `${process.env.FRONTEND_URL}/verify-email?token=${token}`
        ).catch(err => {
            console.error("EMAIL SEND ERROR:", err);
        });

        return {
            user_id: user._id,
            message: 'Signup successful, confirmation email sent'
        };

    } catch (err) {
        if (err && err.code === 11000) {
            throw new Error('Email or phone already exists');
        }
        throw err;
    }
}


/* ======================================================
  verify Email
====================================================== */
export async function verifyEmailService(token) {
    // 1️⃣ Find auth by valid token
    const auth = await Auth.findOne({
        email_verify_token_hash: sha256(token),
        email_verify_token_expires_at: { $gt: new Date() }
    });

    if (!auth) {
        throw new Error('Invalid or expired verification link');
    }

    // 2️⃣ Activate user + mark email verified
    await User.updateOne(
        { _id: auth.user_id },
        {
            $set: {
                status: 'ACTIVE',
                isMailVerified: true
            }
        }
    );

    // 3️⃣ Clear token (important)
    await Auth.updateOne(
        { _id: auth._id },
        {
            $unset: {
                email_verify_token_hash: 1,
                email_verify_token_expires_at: 1
            }
        }
    );

    // 4️⃣ Create DEMO account (non-blocking)
    Account.create({
        user_id: auth.user_id,
        type: 'DEMO',
        balance: 10000
    }).catch(() => { });

    // 5️⃣ Create UserProfile if not exists (AFTER confirm)
    const profileExists = await UserProfile.findOne(
        { user_id: auth.user_id },
        { _id: 1 }
    ).lean();

    if (!profileExists) {
        UserProfile.create({
            user_id: auth.user_id,
            date_of_birth: null,
            gender: null,
            address_line_1: '',
            address_line_2: '',
            city: '',
            state: '',
            country: '',
            pincode: ''
        }).catch(() => { });
    }

    return {
        user_id: auth.user_id,
        message: 'Email verified successfully'
    };
}



/* ======================================================
   LOGIN
====================================================== */

export async function loginService({
    email,
    password,
    ip,
    device,
    fcmToken
}) {
    // 1 Find user
    const user = await User.findOne({ email: email.toLowerCase() }).lean();
    if (!user) throw new Error('Invalid credentials');

    // 2 Find auth record
    const auth = await Auth.findOne({ user_id: user._id });
    if (!auth) throw new Error('Invalid credentials');

    // 3 Check password
    const ok = await comparePassword(password, auth.password_hash);
    if (!ok) {
        Auth.updateOne(
            { _id: auth._id },
            { $inc: { login_attempts: 1 } }
        ).catch(() => { });
        throw new Error('Invalid credentials');
    }

    // 4 Generate refresh token
    const refreshToken = randomToken();

    // 5 Update auth info
    Auth.updateOne(
        { _id: auth._id },
        {
            $set: {
                login_attempts: 0,
                last_login_at: new Date(),
                last_login_ip: ip,
                last_login_device: device,

                refresh_token_hash: sha256(refreshToken),
                refresh_token_expires_at: new Date(
                    Date.now() + 7 * 24 * 60 * 60 * 1000
                ),
                refresh_token_ip: ip,
                refresh_token_device: device
            }
        }
    ).catch(() => { });

    // 6 FCM token handling (unchanged)
    if (fcmToken) {
        process.nextTick(async () => {
            try {
                await UserDevice.updateOne(
                    { fcm_token: fcmToken },
                    {
                        $set: {
                            user_id: user._id,
                            platform: 'web',
                            last_used_at: new Date()
                        }
                    },
                    { upsert: true }
                );

                await admin.messaging().subscribeToTopic(
                    [fcmToken],
                    'all_users'
                );
            } catch (err) { }
        });
    }

    // 7 Return tokens + role
    return {
        accessToken: signAccessToken(user),
        refreshToken,
        role: user.userType,
        isMailVerified: user.isMailVerified,
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
    console.log('FRONTEND_URL =>', process.env.FRONTEND_URL);

    sendResetPasswordMail(
        user.email,
        `${process.env.FRONTEND_URL}/reset-password?token=${token}`
    ).catch(() => { });
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
/* ================= resend mail confirm================ */
export async function resendEmailVerificationService(email) {
    const user = await User.findOne(
        { email: email.toLowerCase() },
        { _id: 1, isMailVerified: 1 }
    ).lean();

    if (!user) {
        throw new Error('User not found');
    }

    if (user.isMailVerified) {
        throw new Error('Email already verified');
    }

    const auth = await Auth.findOne({ user_id: user._id });
    if (!auth) {
        throw new Error('Auth record not found');
    }

    const token = randomToken();

    await Auth.updateOne(
        { _id: auth._id },
        {
            $set: {
                email_verify_token_hash: sha256(token),
                email_verify_token_expires_at: new Date(
                    Date.now() + 24 * 60 * 60 * 1000
                )
            }
        }
    );

    sendEmailVerificationMail(
        email,
        `${process.env.FRONTEND_URL}/verify-email?token=${token}`
    ).catch(() => { });

    return {
        user_id: user._id,
        message: 'Confirmation email resent'
    };
}