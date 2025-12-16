import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    otp: {
      type: String,
      required: true
    },

    expires_at: {
      type: Date,
      required: true,
      index: { expires: 0 }   // 🔥 TTL auto delete
    },

    used: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

otpSchema.index({ user_id: 1, createdAt: -1 });

export default mongoose.model('Otp', otpSchema);
