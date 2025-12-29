import mongoose from 'mongoose';

const AccountPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true // STANDARD / RAW / ECN / PREMIUM etc
    },

    spreadPips: {
      type: Number,
      default: 0.0 // 0.0 = market pricing
    },

    commission: {
      type: Number,
      default: 0 // per lot
    },

    leverageNote: {
      type: String,
      default: 'Unlimited'
    },

    minLotSize: {
      type: Number,
      default: 0.01
    },

    minDeposit: {
      type: Number,
      default: 0
    },

    guidance: {
      type: String,
      default: ''
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model('AccountPlan', AccountPlanSchema);
