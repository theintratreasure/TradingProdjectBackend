import UserDevice from '../models/UserDevice.model.js';
import { adminListUsersService, adminUpdateUserService, getMyProfileService, updateMyProfileService, searchUsersService } from '../services/user.service.js';

export async function getMyProfile(req, res) {
  const data = await getMyProfileService(req.user._id);

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  return res.json({
    success: true,
    data
  });
}

export async function updateMyProfile(req, res) {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body is required'
      });
    }
    console.log('req,user.id', req.user._id);
    const profile = await updateMyProfileService(
      req.user._id,
      req.body
    );

    if (!profile) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile, '
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
}
export async function saveFcmToken(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const userId = req.user._id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    await UserDevice.findOneAndUpdate(
      { fcm_token: token },   // 🔥 token unique hai, best filter
      {
        user_id: userId,      // ✅ schema ke according
        fcm_token: token,
        platform: "web",
        last_used_at: new Date(), // ✅ schema ke according
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: "FCM token saved",
    });
  } catch (err) {
    console.error("Save FCM token error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to save FCM token",
    });
  }
}

export async function adminSearchUsers(req, res) {
  try {
    const data = await searchUsersService(req.query);

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
}

export async function adminUpdateUser(req, res) {
  try {
    const { userId } = req.params;
    const data = await adminUpdateUserService(userId, req.body);

    return res.json({
      success: true,
      message: 'User updated successfully',
      data
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
}

export async function adminListUsers(req, res) {
  try {
    const data = await adminListUsersService(req.query);

    return res.json({
      success: true,
      data: data.items,
      pagination: data.pagination
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
}


