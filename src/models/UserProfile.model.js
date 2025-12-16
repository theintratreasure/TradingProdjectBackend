import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    date_of_birth: {
      type: Date,
      default: null
    },

    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'OTHER'],
      default: null
    },

    address_line_1: {
      type: String,
      trim: true,
      default: ''
    },

    address_line_2: {
      type: String,
      trim: true,
      default: ''
    },

    city: {
      type: String,
      trim: true,
      default: ''
    },

    state: {
      type: String,
      trim: true,
      default: ''
    },

    country: {
      type: String,
      trim: true,
      default: ''
    },

    pincode: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

/**
 * Fast lookup
 */
userProfileSchema.index({ user_id: 1 });

export default mongoose.model('UserProfile', userProfileSchema);
