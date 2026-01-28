import mongoose from "mongoose";

const TradeSchema = new mongoose.Schema(
  {
    /* =========================
       OWNERSHIP / SECURITY
    ========================== */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    ipAddress: {
      type: String,
      required: true,
    },

    /* =========================
       TRADE IDENTITY
    ========================== */

    symbol: {
      type: String,
      required: true,
      index: true,
    },

    side: {
      type: String,
      enum: ["BUY", "SELL"],
      required: true,
    },

    orderType: {
      type: String,
      enum: [
        "MARKET",
        "LIMIT",
        "BUY_STOP",
        "SELL_STOP",
      ],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "OPEN", "CLOSED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    /* =========================
       TRADE VOLUME & PRICING
    ========================== */

    volume: {
      type: Number,
      required: true,
      min: 0,
    },

    contractSize: {
      type: Number,
      required: true,
    },

    leverage: {
      type: Number,
      required: true,
    },

    openPrice: {
      type: Number,
    },

    closePrice: {
      type: Number,
    },

    entryPrice: {
      type: Number,
      /**
       * Used for:
       * LIMIT / BUY_STOP / SELL_STOP
       */
    },

    /* =========================
       STOP LOSS / TAKE PROFIT
    ========================== */

    stopLoss: {
      type: Number,
    },

    takeProfit: {
      type: Number,
    },

    /* =========================
       MARGIN & PNL
    ========================== */

    marginUsed: {
      type: Number,
      required: true,
    },

    realizedPnL: {
      type: Number,
      default: 0,
    },

    /* =========================
       TIME & LIFECYCLE
    ========================== */

    openTime: {
      type: Date,
      index: true,
    },

    closeTime: {
      type: Date,
    },

    closeReason: {
      type: String,
      enum: [
        "MANUAL",
        "STOP_LOSS",
        "TAKE_PROFIT",
        "STOP_OUT",
        "SYSTEM",
      ],
    },

    /* =========================
       AUDIT / SAFETY
    ========================== */

    engineVersion: {
      type: String,
    },

    metadata: {
      type: Object,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   🔥 PERFORMANCE INDEXES
   (150k+ users ready)
========================== */

TradeSchema.index({ accountId: 1, status: 1 });
TradeSchema.index({ userId: 1, openTime: -1 });
TradeSchema.index({ symbol: 1, status: 1 });
TradeSchema.index({ orderType: 1, status: 1 });
TradeSchema.index({ openTime: -1 });

const Trade = mongoose.model("Trade", TradeSchema);
export default Trade;
