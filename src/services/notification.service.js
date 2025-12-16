import admin from '../config/firebase.js';

export async function broadcastNotification({
  title,
  message,
  data
}) {
  if (!title || !message) {
    throw new Error('title and message are required');
  }

  const response = await admin.messaging().send({
    topic: 'all_users',
    notification: {
      title: title,
      body: message
    },
    data: data ? data : {}
  });

  return response;
}
