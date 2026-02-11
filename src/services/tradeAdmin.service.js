import Trade from "../models/Trade.model.js";
import PendingOrder from "../models/PendingOrder.model.js";
import User from "../models/User.model.js";
import mongoose from "mongoose";
import Brokerage from "../models/Brokerage.model.js";

const TRADE_SIDES = new Set(["BUY", "SELL"]);
const TRADE_ORDER_TYPES = new Set([
  "MARKET",
  "BUY_LIMIT",
  "SELL_LIMIT",
  "BUY_STOP",
  "SELL_STOP",
]);
const TRADE_ORDER_KIND_TO_TYPES = {
  MARKET: ["MARKET"],
  LIMIT: ["BUY_LIMIT", "SELL_LIMIT"],
  STOP: ["BUY_STOP", "SELL_STOP"],
};

const PENDING_ORDER_TYPES = new Set([
  "BUY_LIMIT",
  "SELL_LIMIT",
  "BUY_STOP",
  "SELL_STOP",
]);
const PENDING_ORDER_KIND_TO_TYPES = {
  LIMIT: ["BUY_LIMIT", "SELL_LIMIT"],
  STOP: ["BUY_STOP", "SELL_STOP"],
};
const PENDING_ORDER_HISTORY_STATUSES = [
  "EXECUTED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
];
const PENDING_ORDER_REJECTED_STATUSES = ["CANCELLED", "EXPIRED", "FAILED"];

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

export const adminListClosedTradesService = async (query = {}) => {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const skip = (page - 1) * limit;

  const match = {
    status: "CLOSED",
  };

  if (query.userId !== undefined) {
    if (!mongoose.isValidObjectId(query.userId)) {
      throw new Error("Invalid userId");
    }
    match.userId = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.accountId !== undefined) {
    if (!mongoose.isValidObjectId(query.accountId)) {
      throw new Error("Invalid accountId");
    }
    match.accountId = new mongoose.Types.ObjectId(query.accountId);
  }

  if (typeof query.positionId === "string" && query.positionId.trim()) {
    match.positionId = query.positionId.trim();
  }

  if (typeof query.symbol === "string" && query.symbol.trim()) {
    match.symbol = query.symbol.trim().toUpperCase();
  }

  if (typeof query.side === "string" && query.side.trim()) {
    const side = query.side.trim().toUpperCase();
    if (!TRADE_SIDES.has(side)) {
      throw new Error("Invalid side. Allowed: BUY, SELL");
    }
    match.side = side;
  }

  if (typeof query.orderType === "string" && query.orderType.trim()) {
    const orderType = query.orderType.trim().toUpperCase();
    if (!TRADE_ORDER_TYPES.has(orderType)) {
      throw new Error(
        "Invalid orderType. Allowed: MARKET, BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP",
      );
    }
    match.orderType = orderType;
  } else if (typeof query.orderKind === "string" && query.orderKind.trim()) {
    const orderKind = query.orderKind.trim().toUpperCase();
    const mappedTypes = TRADE_ORDER_KIND_TO_TYPES[orderKind];
    if (!mappedTypes) {
      throw new Error("Invalid orderKind. Allowed: MARKET, LIMIT, STOP");
    }
    match.orderType = { $in: mappedTypes };
  }

  const timeFieldRaw =
    typeof query.timeField === "string" ? query.timeField.trim() : "";
  const timeField = ["openTime", "closeTime", "createdAt"].includes(timeFieldRaw)
    ? timeFieldRaw
    : "closeTime";

  const from = typeof query.from === "string" ? new Date(query.from) : null;
  const to = typeof query.to === "string" ? new Date(query.to) : null;
  const fromValid = from instanceof Date && !Number.isNaN(from.getTime());
  const toValid = to instanceof Date && !Number.isNaN(to.getTime());

  if (query.from && !fromValid) {
    throw new Error("Invalid from date");
  }
  if (query.to && !toValid) {
    throw new Error("Invalid to date");
  }

  if (fromValid || toValid) {
    match[timeField] = {};
    if (fromValid) match[timeField].$gte = from;
    if (toValid) match[timeField].$lte = to;
  }

  const sortDirRaw =
    typeof query.sortDir === "string" ? query.sortDir.trim().toLowerCase() : "";
  const sortDir = sortDirRaw === "asc" ? 1 : -1;
  const sortByRaw =
    typeof query.sortBy === "string" ? query.sortBy.trim() : "";
  const sortBy = ["closeTime", "openTime", "createdAt"].includes(sortByRaw)
    ? sortByRaw
    : timeField;

  const pipeline = [
    { $match: match },
    {
      $facet: {
        items: [
          { $sort: { [sortBy]: sortDir, _id: sortDir } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              userId: 1,
              accountId: 1,
              ipAddress: 1,

              positionId: 1,
              symbol: 1,
              side: 1,
              orderType: 1,
              status: 1,

              volume: 1,
              contractSize: 1,
              leverage: 1,
              openPrice: 1,
              entryPrice: 1,
              closePrice: 1,

              stopLoss: 1,
              takeProfit: 1,

              marginUsed: 1,
              grossPnL: 1,
              commission: 1,
              spread: 1,
              swap: 1,
              realizedPnL: 1,

              openTime: 1,
              closeTime: 1,
              closeReason: 1,

              engineVersion: 1,

              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        meta: [{ $count: "total" }],
      },
    },
    {
      $addFields: {
        total: { $ifNull: [{ $arrayElemAt: ["$meta.total", 0] }, 0] },
      },
    },
    {
      $project: {
        items: 1,
        total: 1,
      },
    },
  ];

  const agg = await Trade.aggregate(pipeline).allowDiskUse(true);
  const row = agg?.[0] || { items: [], total: 0 };
  const totalRaw = Number(row.total);
  const total = Number.isFinite(totalRaw) ? totalRaw : 0;

  return {
    items: Array.isArray(row.items) ? row.items : [],
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

export const adminListPendingOrdersHistoryService = async (query = {}) => {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const skip = (page - 1) * limit;

  const match = {};

  const statusRaw =
    typeof query.status === "string" ? query.status.trim().toUpperCase() : "";
  if (statusRaw) {
    if (statusRaw === "ALL") {
      match.status = { $in: PENDING_ORDER_HISTORY_STATUSES };
    } else if (statusRaw === "REJECTED") {
      match.status = { $in: PENDING_ORDER_REJECTED_STATUSES };
    } else if (PENDING_ORDER_HISTORY_STATUSES.includes(statusRaw)) {
      match.status = statusRaw;
    } else if (statusRaw === "PENDING") {
      throw new Error("PENDING is not allowed in this endpoint");
    } else {
      throw new Error(
        "Invalid status. Allowed: EXECUTED, CANCELLED, EXPIRED, FAILED, REJECTED, ALL",
      );
    }
  } else {
    match.status = { $in: PENDING_ORDER_HISTORY_STATUSES };
  }

  if (query.userId !== undefined) {
    if (!mongoose.isValidObjectId(query.userId)) {
      throw new Error("Invalid userId");
    }
    match.userId = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.accountId !== undefined) {
    if (!mongoose.isValidObjectId(query.accountId)) {
      throw new Error("Invalid accountId");
    }
    match.accountId = new mongoose.Types.ObjectId(query.accountId);
  }

  if (typeof query.orderId === "string" && query.orderId.trim()) {
    match.orderId = query.orderId.trim();
  }

  if (
    typeof query.executedPositionId === "string" &&
    query.executedPositionId.trim()
  ) {
    match.executedPositionId = query.executedPositionId.trim();
  }

  if (typeof query.symbol === "string" && query.symbol.trim()) {
    match.symbol = query.symbol.trim().toUpperCase();
  }

  if (typeof query.side === "string" && query.side.trim()) {
    const side = query.side.trim().toUpperCase();
    if (!TRADE_SIDES.has(side)) {
      throw new Error("Invalid side. Allowed: BUY, SELL");
    }
    match.side = side;
  }

  if (typeof query.orderType === "string" && query.orderType.trim()) {
    const orderType = query.orderType.trim().toUpperCase();
    if (!PENDING_ORDER_TYPES.has(orderType)) {
      throw new Error(
        "Invalid orderType. Allowed: BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP",
      );
    }
    match.orderType = orderType;
  } else if (typeof query.orderKind === "string" && query.orderKind.trim()) {
    const orderKind = query.orderKind.trim().toUpperCase();
    const mappedTypes = PENDING_ORDER_KIND_TO_TYPES[orderKind];
    if (!mappedTypes) {
      throw new Error("Invalid orderKind. Allowed: LIMIT, STOP");
    }
    match.orderType = { $in: mappedTypes };
  }

  const timeFieldRaw =
    typeof query.timeField === "string" ? query.timeField.trim() : "";
  const timeField = [
    "createdAt",
    "updatedAt",
    "executedAt",
    "cancelledAt",
    "expireAt",
    "failedAt",
  ].includes(timeFieldRaw)
    ? timeFieldRaw
    : "createdAt";

  const from = typeof query.from === "string" ? new Date(query.from) : null;
  const to = typeof query.to === "string" ? new Date(query.to) : null;
  const fromValid = from instanceof Date && !Number.isNaN(from.getTime());
  const toValid = to instanceof Date && !Number.isNaN(to.getTime());

  if (query.from && !fromValid) {
    throw new Error("Invalid from date");
  }
  if (query.to && !toValid) {
    throw new Error("Invalid to date");
  }

  if (fromValid || toValid) {
    match[timeField] = {};
    if (fromValid) match[timeField].$gte = from;
    if (toValid) match[timeField].$lte = to;
  }

  const sortDirRaw =
    typeof query.sortDir === "string" ? query.sortDir.trim().toLowerCase() : "";
  const sortDir = sortDirRaw === "asc" ? 1 : -1;
  const sortByRaw =
    typeof query.sortBy === "string" ? query.sortBy.trim() : "";
  const sortBy = [
    "createdAt",
    "updatedAt",
    "executedAt",
    "cancelledAt",
    "expireAt",
    "failedAt",
  ].includes(sortByRaw)
    ? sortByRaw
    : timeField;

  const pipeline = [
    { $match: match },
    {
      $facet: {
        items: [
          { $sort: { [sortBy]: sortDir, _id: sortDir } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              userId: 1,
              accountId: 1,

              orderId: 1,
              executedPositionId: 1,

              symbol: 1,
              side: 1,
              orderType: 1,

              price: 1,
              volume: 1,

              stopLoss: 1,
              takeProfit: 1,

              status: 1,
              executedAt: 1,
              cancelledAt: 1,
              expireAt: 1,
              failReason: 1,
              failedAt: 1,

              engineVersion: 1,

              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        meta: [{ $count: "total" }],
      },
    },
    {
      $addFields: {
        total: { $ifNull: [{ $arrayElemAt: ["$meta.total", 0] }, 0] },
      },
    },
    {
      $project: {
        items: 1,
        total: 1,
      },
    },
  ];

  const agg = await PendingOrder.aggregate(pipeline).allowDiskUse(true);
  const row = agg?.[0] || { items: [], total: 0 };
  const totalRaw = Number(row.total);
  const total = Number.isFinite(totalRaw) ? totalRaw : 0;

  return {
    items: Array.isArray(row.items) ? row.items : [],
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
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
