import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    //  USER
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    //  ACCOUNT (TRADING ACCOUNT)
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true
    },
    //  TRANSACTION TYPE
    type: {
      type: String,
      enum: [
        'DEPOSIT',
        'WITHDRAWAL',
        'TRADE_PROFIT',
        'TRADE_LOSS',
        'BONUS',
        'REFERRAL',
        'ADJUSTMENT'
      ],
      required: true,
      index: true
    },
    //  AMOUNT (ALWAYS POSITIVE)
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    //  BALANCE AFTER THIS TRANSACTION (SNAPSHOT)
    balanceAfter: {
      type: Number,
      required: true,
      min: 0
    },
    //  TRANSACTION STATUS
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'SUCCESS',
      index: true
    },
    //  REFERENCE TYPE (FOR DEBUGGING & AUDIT)
    referenceType: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'ORDER', 'SYSTEM'],
      index: true
    },
    //  REFERENCE ID (DEPOSIT ID / WITHDRAW ID / ORDER ID)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },
    //  WHO CREATED THIS (ADMIN / SYSTEM)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    //  OPTIONAL REMARK / NOTE
    remark: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

/*  HIGH-SCALE PERFORMANCE INDEXES */
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ account: 1, createdAt: -1 });
TransactionSchema.index({ user: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, createdAt: -1 });
TransactionSchema.index({ referenceType: 1, referenceId: 1 });

export default mongoose.model('Transaction', TransactionSchema);
