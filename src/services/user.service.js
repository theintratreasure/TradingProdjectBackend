import mongoose from 'mongoose';
import User from '../models/User.model.js';
import UserProfile from '../models/UserProfile.model.js';
export async function getMyProfileService(userId) {
  const result = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: 'userprofiles',
        localField: '_id',
        foreignField: 'user_id',
        as: 'profile'
      }
    },
    {
      $unwind: {
        path: '$profile',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 1,
        email: 1,
        phone: 1,
        name: 1,
        isMailVerified: 1,
        kycStatus: 1,

        date_of_birth: '$profile.date_of_birth',
        gender: '$profile.gender',
        address_line_1: '$profile.address_line_1',
        address_line_2: '$profile.address_line_2',
        city: '$profile.city',
        state: '$profile.state',
        country: '$profile.country',
        pincode: '$profile.pincode'
      }
    }
  ]);

  return result.length ? result[0] : null;
}

export async function updateMyProfileService(userId, payload = {}) {
  console.log('UPDATE PROFILE SERVICE CALLED');
  console.log('USER ID =>', userId);
  console.log('PAYLOAD =>', payload);

  const allowedData = {
    date_of_birth: payload.date_of_birth ?? null,
    gender: payload.gender ?? null,
    address_line_1: payload.address_line_1 ?? '',
    address_line_2: payload.address_line_2 ?? '',
    city: payload.city ?? '',
    state: payload.state ?? '',
    country: payload.country ?? '',
    pincode: payload.pincode ?? ''
  };

  console.log('ALLOWED DATA =>', allowedData);

  const profile = await UserProfile.findOneAndUpdate(
    { user_id: userId },
    { $set: allowedData },
    {
      new: true,
      upsert: true,
      lean: true
    }
  );

  console.log('UPDATED PROFILE =>', profile);

  return profile;
}
