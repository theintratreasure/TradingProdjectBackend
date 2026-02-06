import Trade from "../models/Trade.model.js";
import PendingOrder from "../models/PendingOrder.model.js";
import User from "../models/User.model.js";
import mongoose from "mongoose";
import Brokerage from "../models/Brokerage.model.js";

export const getTradeAdminSummaryService = async () => {
  const [activePositions, pendingOrders, activeUsers, activeTradingAccountIds] =
    await Promise.all([
      Trade.countDocuments({ status: "OPEN" }),
      PendingOrder.countDocuments({ status: "PENDING" }),
      User.countDocuments({}),
      Trade.distinct("accountId", { status: "OPEN" })
    ]);

  return {
    activePositions,
    activePendingOrders: pendingOrders,
    activeUsers,
    activeTradingAccounts: Array.isArray(activeTradingAccountIds)
      ? activeTradingAccountIds.length
      : 0
  };
};

export const adminListBrokerageService = async (query = {}) => {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.userId && mongoose.isValidObjectId(query.userId)) {
    filter.user_id = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.accountId && mongoose.isValidObjectId(query.accountId)) {
    filter.account_id = new mongoose.Types.ObjectId(query.accountId);
  }

  if (query.tradeId && mongoose.isValidObjectId(query.tradeId)) {
    filter.trade_id = new mongoose.Types.ObjectId(query.tradeId);
  }

  if (query.symbol) {
    filter.symbol = String(query.symbol).trim().toUpperCase();
  }

  const from = typeof query.from === "string" ? new Date(query.from) : null;
  const to = typeof query.to === "string" ? new Date(query.to) : null;
  const fromValid = from instanceof Date && !Number.isNaN(from.getTime());
  const toValid = to instanceof Date && !Number.isNaN(to.getTime());

  if (fromValid || toValid) {
    filter.createdAt = {};
    if (fromValid) filter.createdAt.$gte = from;
    if (toValid) filter.createdAt.$lte = to;
  }

  const [items, total] = await Promise.all([
    Brokerage.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Brokerage.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
