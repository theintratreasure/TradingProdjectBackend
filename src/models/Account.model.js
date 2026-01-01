import mongoose from "mongoose";

const AccountSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    account_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountPlan",
      required: true,
      index: true
    },

    account_number: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    account_type: {
      type: String,
      enum: ["demo", "live"],
      required: true,
      index: true
    },

    balance: {
      type: Number,
      required: true,
      default: 0
    },

    equity: {
      type: Number,
      required: true,
      default: 0
    },

    leverage: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      required: true
    },

    spread_type: {
      type: String,
      enum: ["FIXED", "FLOATING"],
      required: true
    },

    commission_per_lot: {
      type: Number,
      default: 0
    },

    swap_enabled: {
      type: Boolean,
      default: true
    },

    // 🔹 FIRST DEPOSIT FLAG
    first_deposit: {
      type: Boolean,
      default: false,
      index: true
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true
    }
  },
  { timestamps: true }
);

AccountSchema.index({ user_id: 1, account_type: 1 });

export default mongoose.model("Account", AccountSchema);
