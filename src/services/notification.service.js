import admin from '../config/firebase.js';
import UserDevice from '../models/UserDevice.model.js';

export async function broadcastNotification({
  title,
  message,
  data
}) {
  if (!title || !message) {
    throw new Error('title and message are required');
  }

  // 🔥 All active FCM tokens
  const devices = await UserDevice.find(
    { platform: 'web' },
    { fcm_token: 1, _id: 0 }
  ).lean();

  const tokens = devices.map(d => d.fcm_token).filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('No active FCM tokens found');
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title,
      body: message,
      ...(data || {})
    },
    webpush: {
      headers: {
        Urgency: 'high'
      }
    }
  });

  console.log('✅ FCM SENT:', response);

  return response;
}
