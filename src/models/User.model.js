import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true
    },

    name: {
      type: String,
      trim: true
    },

    userType: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
      index: true
    },

    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'BLOCKED'],
      default: 'PENDING',
      index: true
    },

    signup_ip: {
      type: String,
      default: null,
      index: true
    },
  },
  {
    timestamps: true
  }
);

export default mongoose.model('User', userSchema);
