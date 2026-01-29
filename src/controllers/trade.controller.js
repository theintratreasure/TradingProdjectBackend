import { tradeEngine } from "../trade-engine/bootstrap.js";
import Account from "../models/Account.model.js";
import { getDealsService, getOrdersService, getPositionsService, getTradeSummaryService } from "../services/tradeOrder.service.js";

/* =========================
   COMMON: ACCOUNT OWNERSHIP
========================= */
async function verifyAccountOwnership(userId, accountId) {
  const exists = await Account.exists({
    _id: accountId,
    user_id: userId,
    status: "active",
  });

  if (!exists) {
    throw new Error("Account does not belong to user");
  }
}

/* =========================
   MARKET ORDER (BUY / SELL)
========================= */
export async function placeMarketOrderController(req, res) {
  try {
    const userId = String(req.user._id);

    const {
      accountId,
      symbol,
      side,
      volume,
      stopLoss,
      takeProfit,
    } = req.body;

    if (!accountId || !symbol || !side || !volume) {
      return res.status(400).json({
        status: "error",
        message: "accountId, symbol, side and volume are required",
      });
    }

    if (side !== "BUY" && side !== "SELL") {
      return res.status(400).json({
        status: "error",
        message: "side must be BUY or SELL",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const position = tradeEngine.placeMarketOrder({
      accountId: String(accountId),
      symbol: String(symbol).toUpperCase(),
      side,
      volume: Number(volume),
      stopLoss: typeof stopLoss === "number" ? stopLoss : null,
      takeProfit: typeof takeProfit === "number" ? takeProfit : null,
    });

    return res.json({
      status: "success",
      data: {
        positionId: position.positionId,
        accountId: position.accountId,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        openPrice: position.openPrice,
      },
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message || "Trade failed",
    });
  }
}

/* =========================
   CLOSE OPEN POSITION
========================= */
export async function closePosition(req, res) {
  try {
    const userId = String(req.user._id);
    const { accountId, positionId } = req.body;

    if (!accountId || !positionId) {
      return res.status(400).json({
        status: "error",
        message: "accountId and positionId required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const result = tradeEngine.squareOffPosition({
      accountId: String(accountId),
      positionId: String(positionId),
      reason: "MANUAL_CLOSE",
    });

    return res.json({
      status: "success",
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}

/* =========================
   PLACE PENDING ORDER
   (BUY LIMIT / SELL LIMIT /
    BUY STOP / SELL STOP)
========================= */
export async function placePendingOrderController(req, res) {
  try {
    const userId = String(req.user._id);

    const {
      accountId,
      symbol,
      side,
      orderType,
      price,
      volume,
      stopLoss,
      takeProfit,
    } = req.body;

    if (
      !accountId ||
      !symbol ||
      !side ||
      !orderType ||
      !price ||
      !volume
    ) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const order = tradeEngine.placePendingOrder({
      userId: req.user._id, 
      accountId: String(accountId),
      symbol: String(symbol).toUpperCase(),
      side,
      orderType,
      price: Number(price),
      volume: Number(volume),
      stopLoss: typeof stopLoss === "number" ? stopLoss : null,
      takeProfit: typeof takeProfit === "number" ? takeProfit : null,
    });

    return res.json({
      status: "success",
      data: order,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}

/* =========================
   MODIFY OPEN POSITION
   (STOP LOSS / TAKE PROFIT)
========================= */
export async function modifyPositionController(req, res) {
  try {
    const userId = String(req.user._id);
    const { accountId, positionId, stopLoss, takeProfit } = req.body;

    if (!accountId || !positionId) {
      return res.status(400).json({
        status: "error",
        message: "accountId and positionId required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    tradeEngine.modifyPosition({
      accountId: String(accountId),
      positionId: String(positionId),
      stopLoss: typeof stopLoss === "number" ? stopLoss : null,
      takeProfit: typeof takeProfit === "number" ? takeProfit : null,
    });

    return res.json({
      status: "success",
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}

/* =========================
   MODIFY PENDING ORDER
========================= */
export async function modifyPendingOrderController(req, res) {
  try {
    const userId = String(req.user._id);
    const { accountId, orderId, price, stopLoss, takeProfit } = req.body;

    if (!accountId || !orderId || !price) {
      return res.status(400).json({
        status: "error",
        message: "accountId, orderId and price required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    tradeEngine.modifyPendingOrder({
      accountId: String(accountId),
      orderId: String(orderId),
      price: Number(price),
      stopLoss: typeof stopLoss === "number" ? stopLoss : null,
      takeProfit: typeof takeProfit === "number" ? takeProfit : null,
    });

    return res.json({
      status: "success",
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}

/* =========================
   CANCEL PENDING ORDER
========================= */
export async function cancelPendingOrderController(req, res) {
  try {
    const userId = String(req.user._id);
    const { accountId, orderId } = req.body;

    if (!accountId || !orderId) {
      return res.status(400).json({
        status: "error",
        message: "accountId and orderId required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    tradeEngine.cancelPendingOrder({
      accountId: String(accountId),
      orderId: String(orderId),
    });

    return res.json({
      status: "success",
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}
/* =========================
   ORDERS HISTORY API 
========================= */
export async function getOrdersController(req, res) {
  try {
    const userId = String(req.user._id);
    const {
      accountId,
      page = 1,
      limit = 20,
      symbol,
      from,
      to,
    } = req.query;

    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "accountId is required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const result = await getOrdersService({
      accountId,
      page: Number(page),
      limit: Number(limit),
      symbol,
      from,
      to,
    });

    return res.json({
      status: "success",
      summary: result.summary,
      pagination: result.pagination,
      orders: result.orders,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}
/* =========================
   DEALS HISTORY API 
========================= */
export async function getDealsController(req, res) {
  try {
    const userId = String(req.user._id);
    const {
      accountId,
      page = 1,
      limit = 20,
      symbol,
      from,
      to,
    } = req.query;

    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "accountId is required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const data = await getDealsService({
      accountId,
      page: Number(page),
      limit: Number(limit),
      symbol,
      from,
      to,
    });

    return res.json({
      status: "success",
      summary: data.summary,
      pagination: data.pagination,
      deals: data.deals,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}
/* =========================
   TRADE SUMMARY PNL , DEPOSIT , BALANCE API 
========================= */
export async function getTradeSummaryController(req, res) {
  try {
    const userId = String(req.user._id);
    const { accountId, from, to } = req.query;

    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "accountId is required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const summary = await getTradeSummaryService({
      accountId,
      from,
      to,
    });

    return res.json({
      status: "success",
      summary,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}
/* =========================
   open TRADE POSITIONS HISTORY API 
========================= */
export async function getPositionsController(req, res) {
  try {
    const userId = String(req.user._id);
    const {
      accountId,
      page = 1,
      limit = 20,
      symbol,
      from,
      to,
      status, // OPEN / CLOSED
    } = req.query;

    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "accountId is required",
      });
    }

    await verifyAccountOwnership(userId, accountId);

    const result = await getPositionsService({
      accountId,
      page: Number(page),
      limit: Number(limit),
      symbol,
      from,
      to,
      status,
    });

    return res.json({
      status: "success",
      pagination: result.pagination,
      positions: result.positions,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
}