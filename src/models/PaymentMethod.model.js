import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['BANK', 'UPI', 'CRYPTO'],
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true
    },

    // BANK
    bank_name: String,
    account_name: String,
    account_number: String,
    ifsc: String,

    // UPI
    upi_id: String,

    // CRYPTO
    crypto_network: String,
    crypto_address: String,

    image_url: String,

    is_active: {
      type: Boolean,
      default: true,
      index: true
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

paymentMethodSchema.index({ is_active: 1, type: 1 });

export default mongoose.model('PaymentMethod', paymentMethodSchema);
