import UserDevice from '../models/UserDevice.model.js';

export async function saveDeviceToken(req, res) {
  try {
    const userId = req.user._id; // auth middleware se milna chahiye
    const { fcmToken, platform } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token required"
      });
    }

    await UserDevice.updateOne(
      { fcm_token: fcmToken },
      {
        $set: {
          user_id: userId,
          platform: platform || "android",
          last_used_at: new Date()
        }
      },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: "Device token saved"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
