import mongoose from "mongoose";

const AccountSchema = new mongoose.Schema(
  {
    //  USER
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    //  PLAN REFERENCE (ADMIN / AUDIT)
    account_plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountPlan",
      required: true,
      index: true,
    },

    //  ACCOUNT IDENTIFICATION
    account_number: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    account_type: {
      type: String,
      enum: ["demo", "live"],
      required: true,
      index: true,
    },

    //  PLAN SNAPSHOT (FAST READ – NO POPULATE)
    plan_name: {
      type: String,
      required: true, // STANDARD / ECN / RAW etc
      index: true,
    },

    leverage: {
      type: Number,
      required: true, // snapshot from plan
    },

    spread_type: {
      type: String,
      enum: ["FIXED", "FLOATING"],
      required: true,
    },

    spread_pips: {
      type: Number,
      required: true,
    },

    commission_per_lot: {
      type: Number,
      default: 0,
    },

    swap_enabled: {
      type: Boolean,
      default: true,
    },

    // ✅ SWAP CHARGE SNAPSHOT (From Plan)
    swap_charge: {
      type: Number,
      default: 0, // per lot per day
    },

    //  FINANCIALS
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    // LOCKED FUNDS FOR PENDING WITHDRAWALS
    hold_balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    equity: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      required: true, // USD / INR / EUR etc
    },

    //  FIRST DEPOSIT FLAG
    first_deposit: {
      type: Boolean,
      default: false,
      index: true,
    },

    //  STATUS
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

//  COMPOSITE INDEXES
AccountSchema.index({ user_id: 1, account_type: 1 });
AccountSchema.index({ user_id: 1, status: 1 });

export default mongoose.model("Account", AccountSchema);
