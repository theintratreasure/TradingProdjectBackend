import mongoose from 'mongoose';

const authSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    password_hash: {
      type: String,
      required: true
    },

    login_attempts: {
      type: Number,
      default: 0
    },

    last_login_at: {
      type: Date,
      default: null
    },

    last_login_ip: {
      type: String,
      default: null
    },

    last_login_device: {
      type: String,
      default: null
    },

    /* ================= EMAIL VERIFICATION ================= */

    email_verify_token_hash: {
      type: String,
      default: null,
      index: true
    },

    email_verify_token_expires_at: {
      type: Date,
      default: null
    },

    /* ================= PASSWORD RESET ================= */

    reset_token_hash: {
      type: String,
      default: null,
      index: true
    },

    reset_token_expires_at: {
      type: Date,
      default: null
    },

    /* ================= REFRESH TOKEN ================= */

    refresh_token_hash: {
      type: String,
      default: null,
      index: true
    },

    refresh_token_expires_at: {
      type: Date,
      default: null
    },

    refresh_token_ip: {
      type: String,
      default: null
    },

    refresh_token_device: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model('Auth', authSchema);
