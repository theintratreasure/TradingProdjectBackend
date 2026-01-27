import mongoose from "mongoose";

const AccountAuthSchema = new mongoose.Schema(
  {
    account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },

    account_number: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    trade_password_hash: {
      type: String,
      required: true,
      select: false,
    },

    watch_password_hash: {
      type: String,
      required: true,
      select: false,
    },

    login_attempts: {
      type: Number,
      default: 0,
    },

    last_login_at: Date,
    last_login_ip: String,
    last_login_device: String,

    access_token_hash: {
      type: String,
      select: false,
    },

    access_token_expires_at: Date,

    is_locked: {
      type: Boolean,
      default: false,
      index: true,
    },

    credentials_created_at: {
      type: Date,
      required: true,
    },

    credentials_last_reset_at: Date,
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.model("AccountAuth", AccountAuthSchema);
