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

    max_leverage: {
      type: Number,
      default: 0 // 0 = unlimited, otherwise numeric limit
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

    is_demo_allowed: {
      type: Boolean,
      default: true
    },

    spread_type: {
      type: String,
      enum: ['FIXED', 'FLOATING'],
      default: 'FLOATING'
    },

    commission_per_lot: {
      type: Number,
      default: 0
    },

    swap_enabled: {
      type: Boolean,
      default: true
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
