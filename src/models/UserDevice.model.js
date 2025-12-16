import mongoose from 'mongoose';

const userDeviceSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    fcm_token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    platform: {
      type: String,
      default: 'web'
    },

    last_used_at: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('UserDevice', userDeviceSchema);
