// models/Symbol.model.js
import mongoose from 'mongoose';

const SymbolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,     // 🔒 NO DUPLICATE SYMBOL
      index: true
    },

    category: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('Symbol', SymbolSchema);
