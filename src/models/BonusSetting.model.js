import mongoose from "mongoose";

const BonusSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    bonus_enabled: {
      type: Boolean,
      default: true,
    },

    default_bonus_percent: {
      type: Number,
      default: 0,
      min: 0,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default mongoose.model("BonusSetting", BonusSettingSchema);
