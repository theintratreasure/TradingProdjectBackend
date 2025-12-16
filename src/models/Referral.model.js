import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    referral_code: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    referred_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },

    total_referrals: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED'],
      default: 'PENDING',
      index: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Referral', referralSchema);
