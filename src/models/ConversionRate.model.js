import mongoose from "mongoose";

const conversionRateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "GLOBAL",
    },
    usdtInr: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 90,
    },
    btcUsdt: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 100000,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("ConversionRate", conversionRateSchema);
