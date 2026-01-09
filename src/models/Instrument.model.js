import mongoose from 'mongoose';

const InstrumentSchema = new mongoose.Schema(
  {
    /* =========================
       IDENTITY
    ========================== */
    code: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    segment: {
      type: String,
      required: true,
      uppercase: true,
      index: true
    },

    /* =========================
       VOLUME RULES
    ========================== */
    lotSize: {
      type: Number,
      required: true
    },

    minQty: {
      type: Number,
      required: true
    },

    maxQty: {
      type: Number,
      required: true
    },

    qtyPrecision: {
      type: Number,
      required: true
    },

    /* =========================
       PRICE RULES
    ========================== */
    pricePrecision: {
      type: Number,
      required: true
    },

    // minimum price movement (broker-grade)
    tickSize: {
      type: Number,
      default: null
    },

    /* =========================
       CONTRACT DETAILS
    ========================== */
    contractSize: {
      type: Number,
      default: 1
    },

    /* =========================
       SWAP / OVERNIGHT
    ========================== */
    swapEnabled: {
      type: Boolean,
      default: false
    },

    swapLong: {
      type: Number,
      default: 0
    },

    swapShort: {
      type: Number,
      default: 0
    },

    /* =========================
       STATE FLAGS
    ========================== */
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    isTradeable: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: false,   //  speed + Redis friendly
    versionKey: false
  }
);

export default mongoose.model('Instrument', InstrumentSchema);
