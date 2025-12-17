import { getMyProfileService, updateMyProfileService } from '../services/user.service.js';

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
