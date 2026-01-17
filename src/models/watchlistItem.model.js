import mongoose from 'mongoose';

const WatchlistItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 30,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 60,
    },

    isAdded: {
      type: Boolean,
      default: true,
      index: true,
    },

    isEnable: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

WatchlistItemSchema.index(
  { userId: 1, code: 1 },
  { unique: true, name: 'uniq_user_code' }
);

WatchlistItemSchema.index(
  { userId: 1, createdAt: -1, _id: -1 },
  { name: 'user_watchlist_sort' }
);

const WatchlistItem = mongoose.model('WatchlistItem', WatchlistItemSchema);

export default WatchlistItem;
