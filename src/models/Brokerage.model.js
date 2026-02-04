import mongoose from "mongoose";

const BrokerageSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    trade_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trade",
      required: true,
      index: true,
    },

    symbol: {
      type: String,
      required: true,
      index: true,
      trim: true,
      uppercase: true,
    },

    spread: {
      type: Number,
      default: 0,
      min: 0,
    },

    commission: {
      type: Number,
      default: 0,
    },

    swap: {
      type: Number,
      default: 0,
    },

    pnl: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Fast lookup
BrokerageSchema.index({ user_id: 1, createdAt: -1 });
BrokerageSchema.index({ account_id: 1, createdAt: -1 });
BrokerageSchema.index({ trade_id: 1 });
BrokerageSchema.index({ symbol: 1, createdAt: -1 });

export default mongoose.model("Brokerage", BrokerageSchema);
