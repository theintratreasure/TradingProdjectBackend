import mongoose from 'mongoose';

const publicNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    message: {
      type: String,
      required: true
    },

    data: {
      type: Object,
      default: {}
    },

    isActive: {
      type: Boolean,
      default: true
    },

    expireAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    }
  },
  { timestamps: true }
);

export default mongoose.model(
  'PublicNotification',
  publicNotificationSchema
);
