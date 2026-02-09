// services/notification.service.js
import admin from '../config/firebase.js';
import UserDevice from '../models/UserDevice.model.js';
import PublicNotification from '../models/PublicNotification.model.js';
import AccountAuth from '../models/AccountAuth.model.js';

/**
 * Broadcast to all devices (web + android + ios if present)
 */
export async function broadcastNotification({ title, message, data, expireAt }) {
  if (!title || !message || !expireAt) {
    throw new Error('title, message and expireAt are required');
  }

  const expiryDate = new Date(expireAt);
  if (Number.isNaN(expiryDate.getTime())) throw new Error('Invalid expireAt date');
  if (expiryDate <= new Date()) throw new Error('expireAt must be a future date');

  // 1. Save in DB
  const notification = await PublicNotification.create({
    title,
    message,
    data: data || {},
    expireAt: expiryDate,
  });

  // 2. Get tokens for all platforms (do NOT filter only web)
  const devices = await UserDevice.find(
    { fcm_token: { $exists: true, $ne: '' } },
    { fcm_token: 1, platform: 1, _id: 0 }
  ).lean();

  const tokens = devices.map(d => d.fcm_token).filter(Boolean);
  if (!tokens.length) {
    return { saved: true, pushed: false, reason: 'No active FCM tokens' };
  }

  // 3. Send to Firebase (multicast)
  const response = await admin.messaging().sendEachForMulticast({
    tokens,

    notification: {
      title: title,
      body: message
    },

    data: {
      title: title,
      body: message,
      notificationId: String(notification._id),
      ...(data || {})
    },

    android: {
      priority: "high",
      notification: {
        channelId: "default",
        sound: "default"
      }
    },

    webpush: {
      headers: {
        Urgency: "high"
      }
    }
  });

  // 4. Cleanup invalid tokens and aggregate errors
  const failedTokens = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const errCode = resp.error?.code || resp.error?.message || 'unknown';
      const failedToken = tokens[idx];
      failedTokens.push({ token: failedToken, error: errCode });

      // Remove tokens that are definitely invalid / unregistered
      if (
        resp.error &&
        (resp.error.code === 'messaging/registration-token-not-registered' ||
          resp.error.code === 'messaging/invalid-registration-token')
      ) {
        UserDevice.deleteOne({ fcm_token: failedToken }).catch((err) => {
          console.error('Failed to delete invalid token', failedToken, err);
        });
      }
    }
  });

  return {
    saved: true,
    pushed: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
    failedTokens
  };
}


/**
 * Send to specific user (via AccountAuth tokens)
 */
export async function sendUserNotification({ userId, title, message, data }) {
  if (!userId || !title || !message) {
    throw new Error('userId, title and message are required');
  }

  const accounts = await AccountAuth.find(
    { user_id: userId, fcm_token: { $exists: true, $ne: '' } },
    { fcm_token: 1, _id: 0 }
  ).lean();

  const tokens = accounts.map(acc => acc.fcm_token).filter(Boolean);
  if (!tokens.length) return { success: false, message: 'No active device tokens' };

  const response = await admin.messaging().sendEachForMulticast({
    tokens,

    notification: {
      title: title,
      body: message
    },

    data: {
      title: title,
      body: message,
      notificationId: String(notification._id),
      ...(data || {})
    },

    android: {
      priority: "high",
      notification: {
        channelId: "default",
        sound: "default"
      }
    },

    webpush: {
      headers: {
        Urgency: "high"
      }
    }
  });

  // cleanup for this multicast too
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const failedToken = tokens[idx];
      if (
        resp.error &&
        (resp.error.code === 'messaging/registration-token-not-registered' ||
          resp.error.code === 'messaging/invalid-registration-token')
      ) {
        UserDevice.deleteOne({ fcm_token: failedToken }).catch((err) => {
          console.error('Failed to delete invalid token', failedToken, err);
        });
      }
    }
  });

  return {
    success: true,
    successCount: response.successCount,
    failureCount: response.failureCount,
    response
  };
}

/**
 * Get user notifications (unchanged)
 */
export async function getUserNotificationsService(userId, limit = 20, page = 1) {
  if (!userId) throw new Error('User not authenticated');

  const now = new Date();
  const skip = (page - 1) * limit;

  const notifications = await PublicNotification.find({
    isActive: true,
    expireAt: { $gt: now },
    $or: [
      { user_id: userId },
      { user_id: null }
    ]
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return notifications;
}
