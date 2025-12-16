import { broadcastNotification } from '../services/notification.service.js';

export async function adminBroadcastNotification(req, res) {
  try {
    const { title, message, data } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'title and message are required'
      });
    }

    const result = await broadcastNotification({
      title,
      message,
      data
    });

    return res.json({
      success: true,
      message: 'Notification sent to all users',
      firebaseMessageId: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
