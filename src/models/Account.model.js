import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: ['DEMO', 'REAL'],
      required: true
    },

    balance: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: 'USD'
    },

    is_active: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// one demo + one real max
accountSchema.index({ user_id: 1, type: 1 }, { unique: true });

export default mongoose.model('Account', accountSchema);
