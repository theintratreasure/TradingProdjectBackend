import admin from '../config/firebase.js';
import UserDevice from '../models/UserDevice.model.js';
import PublicNotification from '../models/PublicNotification.model.js';
// send all user notifications
export async function broadcastNotification({
  title,
  message,
  data,
  expireAt
}) {
  if (!title || !message || !expireAt) {
    throw new Error('title, message and expireAt are required');
  }

  const expiryDate = new Date(expireAt);

  if (Number.isNaN(expiryDate.getTime())) {
    throw new Error('Invalid expireAt date');
  }

  if (expiryDate <= new Date()) {
    throw new Error('expireAt must be a future date');
  }

  // 1 SAVE IN DB (SOURCE OF TRUTH)
  const notification = await PublicNotification.create({
    title,
    message,
    data: data || {},
    expireAt: expiryDate
  });

  // 2️ GET ALL FCM TOKENS
  const devices = await UserDevice.find(
    {
      platform: 'web',
      fcm_token: { $exists: true, $ne: '' }
    },
    { fcm_token: 1, _id: 0 }
  ).lean();

  const tokens = devices.map(d => d.fcm_token);

  if (tokens.length === 0) {
    return {
      saved: true,
      pushed: false,
      reason: 'No active FCM tokens'
    };
  }

  // 3️ FIREBASE BROADCAST
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title,
      body: message
    },
    data: {
      notificationId: String(notification._id),
      ...(data || {})
    },
    webpush: {
      headers: {
        Urgency: 'high'
      }
    }
  });

  return {
    saved: true,
    pushed: true,
    fcm: response
  };
}
// send a single notification to a specific token/usr
export async function sendUserNotification({
  userId,
  title,
  message,
  data
}) {
  if (!userId || !title || !message) {
    throw new Error('userId, title and message are required');
  }

  const devices = await UserDevice.find(
    { user_id: userId },   // ✅ FIXED
    { fcm_token: 1, _id: 0 }
  ).lean();

  const tokens = devices.map(d => d.fcm_token).filter(Boolean);

  if (tokens.length === 0) {
    console.log("⚠️ No FCM tokens for user:", userId);
    return { success: false, message: 'No active device tokens' };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title,
      body: message,
      ...(data || {})
    },
    webpush: {
      headers: { Urgency: 'high' }
    }
  });

  console.log("✅ KYC notification sent:", response);

  return response;
}
export async function getUserNotificationsService(userId, limit = 20, page = 1) {
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const now = new Date();
  const skip = (page - 1) * limit;

  const notifications = await PublicNotification.find({
    isActive: true,
    expireAt: { $gt: now },
    $or: [
      { user_id: userId }, // personal
      { user_id: null }    // broadcast
    ]
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return notifications;
}