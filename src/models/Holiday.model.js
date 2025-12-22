import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    date: {
      type: Date,
      required: true
    },

    isActive: {
      type: Boolean,
      default: true
    },

    expireAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    }
  },
  { timestamps: true }
);

/*
  Logic:
  - isActive → for manual enable/disable (admin control)
  - expireAt → MongoDB TTL auto deletes record after holiday passes
*/

export default mongoose.model('Holiday', holidaySchema);
