import mongoose from "mongoose";
import Account from "../models/Account.model.js";
import { tradeEngine } from "../trade-engine/bootstrap.js";
import {
  adminListBrokerageService,
  adminListClosedTradesService,
  adminListPendingOrdersHistoryService,
  getTradeAdminSummaryService,
} from "../services/tradeAdmin.service.js";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function toFiniteNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${fieldName} must be a number`);
  }
  return n;
}

function toOptionalFiniteNumber(value, fieldName) {
  if (value === null || value === undefined || value === "") return null;
  return toFiniteNumber(value, fieldName);
}

function toMaybeFiniteNumber(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === "") return null;
  return toFiniteNumber(value, fieldName);
}

function getRequestIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req?.ip || req?.connection?.remoteAddress || "SYSTEM";
}

async function getAccountForAdminTrade({ userId, accountId }) {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid userId");
  }

  if (!accountId || !mongoose.isValidObjectId(accountId)) {
    throw new Error("Invalid accountId");
  }

  const account = await Account.findOne({
    _id: new mongoose.Types.ObjectId(accountId),
    user_id: new mongoose.Types.ObjectId(userId),
    status: "active",
  })
    .select({
      _id: 1,
      user_id: 1,
      balance: 1,
      leverage: 1,
      commission_per_lot: 1,
      swap_charge: 1,
      spread_enabled: 1,
    })
    .lean();

  if (!account) {
    throw new Error("Account not found for this user");
  }

  return account;
}

function ensureEngineAccountLoaded(accountDoc, ipAddress = "SYSTEM") {
  const accountId = String(accountDoc._id);
  const userId = String(accountDoc.user_id);

  let engineAccount = tradeEngine.accounts.get(accountId);

  // Load account into engine if missing (do NOT overwrite existing state)
  if (!engineAccount) {
    tradeEngine.loadAccount({
      accountId,
      balance: accountDoc.balance,
      leverage: accountDoc.leverage,
      userId,
      lastIp: ipAddress,
      commission_per_lot: Number(accountDoc.commission_per_lot) || 0,
      swap_charge: Number(accountDoc.swap_charge) || 0,
      spread_enabled: Boolean(accountDoc.spread_enabled),
    });

    engineAccount = tradeEngine.accounts.get(accountId);
  }

  // Keep identity + meta fresh
  if (engineAccount) {
    engineAccount.userId = userId;
    engineAccount.lastIp = ipAddress || engineAccount.lastIp || "SYSTEM";
    engineAccount.commission_per_lot = Number(accountDoc.commission_per_lot) || 0;
    engineAccount.swap_charge = Number(accountDoc.swap_charge) || 0;
    engineAccount.spread_enabled = Boolean(accountDoc.spread_enabled);
  }

  return engineAccount;
}

export const getTradeAdminSummary = async (req, res) => {
  try {
    const data = await getTradeAdminSummaryService();

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const adminListBrokerage = async (req, res) => {
  try {
    const result = await adminListBrokerageService(req.query);

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const adminListClosedTrades = async (req, res) => {
  try {
    const result = await adminListClosedTradesService(req.query);

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const adminListPendingOrdersHistory = async (req, res) => {
  try {
    const result = await adminListPendingOrdersHistoryService(req.query);

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   ADMIN: TRADE ON BEHALF
========================= */

export const adminPlaceMarketOrder = async (req, res) => {
  try {
    const {
      accountId,
      userId,
      symbol,
      side,
      volume,
      stopLoss = null,
      takeProfit = null,
    } = req.body || {};

    if (!accountId || !userId || !symbol || !side || volume === undefined) {
      return res.status(400).json({
        success: false,
        message: "accountId, userId, symbol, side and volume are required",
      });
    }

    const sideUpper = String(side).trim().toUpperCase();
    if (sideUpper !== "BUY" && sideUpper !== "SELL") {
      return res.status(400).json({
        success: false,
        message: "side must be BUY or SELL",
      });
    }

    const vol = toFiniteNumber(volume, "volume");
    if (vol <= 0) {
      return res.status(400).json({
        success: false,
        message: "volume must be a positive number",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    const normalizedSymbol = normalizeSymbol(symbol);

    const pos = tradeEngine.placeMarketOrder({
      accountId: String(account._id),
      symbol: normalizedSymbol,
      side: sideUpper,
      volume: vol,
      stopLoss: toOptionalFiniteNumber(stopLoss, "stopLoss"),
      takeProfit: toOptionalFiniteNumber(takeProfit, "takeProfit"),
    });

    return res.json({ success: true, data: pos });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Trade failed",
    });
  }
};

export const adminPlacePendingOrder = async (req, res) => {
  try {
    const {
      accountId,
      userId,
      symbol,
      side,
      orderType,
      price,
      volume,
      stopLoss = null,
      takeProfit = null,
      expireType = "GTC",
      expireAt = null,
    } = req.body || {};

    if (
      !accountId ||
      !userId ||
      !symbol ||
      !side ||
      !orderType ||
      price === undefined ||
      volume === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const sideUpper = String(side).trim().toUpperCase();
    if (sideUpper !== "BUY" && sideUpper !== "SELL") {
      return res.status(400).json({
        success: false,
        message: "side must be BUY or SELL",
      });
    }

    const vol = toFiniteNumber(volume, "volume");
    const pr = toFiniteNumber(price, "price");

    if (vol <= 0) {
      return res.status(400).json({
        success: false,
        message: "volume must be a positive number",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    const normalizedSymbol = normalizeSymbol(symbol);

    const order = tradeEngine.placePendingOrder({
      userId: String(account.user_id),
      accountId: String(account._id),
      symbol: normalizedSymbol,
      side: sideUpper,
      orderType: String(orderType).trim().toUpperCase(),
      price: pr,
      volume: vol,
      stopLoss: toOptionalFiniteNumber(stopLoss, "stopLoss"),
      takeProfit: toOptionalFiniteNumber(takeProfit, "takeProfit"),
      expireType,
      expireAt,
    });

    return res.json({ success: true, data: order });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Pending order failed",
    });
  }
};

export const adminModifyPendingOrder = async (req, res) => {
  try {
    const { accountId, userId, orderId, price, stopLoss, takeProfit } =
      req.body || {};

    if (!accountId || !userId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "accountId, userId and orderId are required",
      });
    }

    if (price === undefined && stopLoss === undefined && takeProfit === undefined) {
      return res.status(400).json({
        success: false,
        message: "At least one of price, stopLoss, takeProfit is required",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    const updated = tradeEngine.modifyPendingOrder({
      accountId: String(account._id),
      orderId: String(orderId),
      price: toMaybeFiniteNumber(price, "price"),
      stopLoss: toMaybeFiniteNumber(stopLoss, "stopLoss"),
      takeProfit: toMaybeFiniteNumber(takeProfit, "takeProfit"),
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const adminCancelPendingOrder = async (req, res) => {
  try {
    const { accountId, userId, orderId } = req.body || {};

    if (!accountId || !userId || !orderId) {
      return res.status(400).json({
        success: false,
        message: "accountId, userId and orderId are required",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    tradeEngine.cancelPendingOrder({ accountId: String(account._id), orderId: String(orderId) });

    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const adminModifyPosition = async (req, res) => {
  try {
    const { accountId, userId, positionId, stopLoss, takeProfit } = req.body || {};

    if (!accountId || !userId || !positionId) {
      return res.status(400).json({
        success: false,
        message: "accountId, userId and positionId are required",
      });
    }

    if (stopLoss === undefined && takeProfit === undefined) {
      return res.status(400).json({
        success: false,
        message: "At least one of stopLoss or takeProfit is required",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    const result = tradeEngine.modifyPosition({
      accountId: String(account._id),
      positionId: String(positionId),
      stopLoss: toMaybeFiniteNumber(stopLoss, "stopLoss"),
      takeProfit: toMaybeFiniteNumber(takeProfit, "takeProfit"),
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const adminClosePosition = async (req, res) => {
  try {
    const { accountId, userId, positionId } = req.body || {};

    if (!accountId || !userId || !positionId) {
      return res.status(400).json({
        success: false,
        message: "accountId, userId and positionId are required",
      });
    }

    const account = await getAccountForAdminTrade({ userId, accountId });
    const ip = getRequestIp(req);
    ensureEngineAccountLoaded(account, ip);

    const result = tradeEngine.squareOffPosition({
      accountId: String(account._id),
      positionId: String(positionId),
      reason: "MANUAL",
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
