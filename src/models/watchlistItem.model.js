import mongoose from "mongoose";

const WatchlistItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ✅ Account wise watchlist
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Prevent duplicates per account
WatchlistItemSchema.index(
  { userId: 1, accountId: 1, code: 1 },
  { unique: true, name: "uniq_user_account_code" }
);

// Sorting index (account wise)
WatchlistItemSchema.index(
  { userId: 1, accountId: 1, createdAt: -1, _id: -1 },
  { name: "user_account_watchlist_sort" }
);

const WatchlistItem = mongoose.model("WatchlistItem", WatchlistItemSchema);

export default WatchlistItem;
