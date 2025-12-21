import mongoose from 'mongoose';

const kycSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    documentType: {
      type: String,
      enum: ['NIC', 'PASSPORT', 'DRIVING_LICENSE', 'ELECTRICITY_BILL'],
      required: true,
      index: true
    },

    documents: {
      front: {
        image_url: { type: String, required: true },
        image_public_id: { type: String, required: true }
      },
      back: {
        image_url: { type: String, default: '', required: true },
        image_public_id: { type: String, default: '' }
      },
      selfie: {
        image_url: { type: String, required: true },
        image_public_id: { type: String, required: true }
      }
    },

    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },

    rejectionReason: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

export default mongoose.model('Kyc', kycSchema);
