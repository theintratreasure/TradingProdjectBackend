import Account from "../models/Account.model.js";
import Trade from "../models/Trade.model.js";
import Transaction from "../models/Transaction.model.js";
import PendingOrder from "../models/PendingOrder.model.js";
import Brokerage from "../models/Brokerage.model.js";
import { engineEvents } from "./EngineEvents.js";

class LedgerQueue {
  constructor() {
    engineEvents.on("ledger", (job) => {
      this.process(job).catch((err) => {
        console.error("[LEDGER][FATAL]", err);
      });
    });

    console.log("[LEDGER] LedgerQueue initialized");
  }

  enqueue(event, payload) {
    setImmediate(() => {
      engineEvents.emit("ledger", { event, payload });
    });
  }

  async process({ event, payload }) {
    console.log("[LEDGER] EVENT RECEIVED:", event);

    switch (event) {
      /* ================= TRADE ================= */

      case "TRADE_OPEN":
        await this.tradeOpen(payload);
        break;

      case "TRADE_CLOSE":
        await this.tradeClose(payload);
        break;

      /* ================= PENDING ================= */

      case "ORDER_PENDING_CREATE":
        await this.pendingCreate(payload);
        break;

      case "ORDER_PENDING_EXECUTE":
        await this.pendingExecute(payload);
        break;

      case "ORDER_PENDING_CANCEL":
        await this.pendingCancel(payload);
        break;

      case "ORDER_PENDING_EXECUTE_FAILED":
        await this.pendingFailed(payload);
        break;

      default:
        console.warn("[LEDGER] UNKNOWN EVENT:", event);
    }
  }

  /* =========================
     TRADE OPEN
  ========================= */

  async tradeOpen({
    userId,
    accountId,
    ipAddress,
    positionId,
    symbol,
    side,
    orderType,
    volume,
    contractSize,
    leverage,
    openPrice,
    stopLoss,
    takeProfit,
    marginUsed,
    spread,
    commissionCharged,
    swapPerDay,
  }) {
    const resolvedUserId =
      userId ||
      (await Account.findById(accountId).select("user_id"))?.user_id;

    if (!resolvedUserId) {
      throw new Error("Ledger tradeOpen: userId not resolved");
    }

    if (typeof marginUsed !== "number") {
      throw new Error("Ledger tradeOpen: marginUsed missing");
    }

    const trade = await Trade.create({
      userId: resolvedUserId,
      accountId,
      ipAddress: ipAddress || "SYSTEM",

      positionId,
      symbol,
      side,
      orderType,
      status: "OPEN",

      volume,
      contractSize,
      leverage,
      openPrice,
      entryPrice: openPrice,

      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,

      marginUsed,
      commission: typeof commissionCharged === "number" ? commissionCharged : 0,
      spread: typeof spread === "number" ? spread : 0,
      swap: typeof swapPerDay === "number" ? swapPerDay : 0,
      openTime: new Date(),
      engineVersion: "ENGINE_V1",
    });

    console.log("[LEDGER][TRADE_OPEN][OK]", trade._id.toString());
  }

  /* =========================
     TRADE CLOSE
  ========================= */

  async tradeClose({
    userId,
    accountId,
    positionId,
    closePrice,
    realizedPnL,
    reason,
  }) {
    const pnl = Number(realizedPnL);

    if (Number.isNaN(pnl)) {
      throw new Error("Ledger tradeClose: realizedPnL is NaN");
    }

    const trade = await Trade.findOneAndUpdate(
      { positionId, status: "OPEN" },
      {
        $set: {
          closePrice,
          realizedPnL: pnl,
          closeReason: reason,
          closeTime: new Date(),
          status: "CLOSED",
        },
      },
      { new: true }
    );

    if (!trade) {
      console.error("[LEDGER][TRADE_CLOSE] Trade not found", positionId);
      return;
    }

    const account = await Account.findById(accountId);

    if (!account) {
      console.error("[LEDGER][TRADE_CLOSE] Account not found", accountId);
      return;
    }

    const newBalance = Number(account.balance) + pnl;

    await Account.updateOne(
      { _id: accountId },
      { $set: { balance: newBalance } }
    );

    const txn = await Transaction.create({
      user: userId || trade.userId,
      account: accountId,
      type: pnl >= 0 ? "TRADE_PROFIT" : "TRADE_LOSS",
      amount: Math.abs(pnl),
      balanceAfter: newBalance,
      referenceType: "TRADE",
      referenceId: trade._id,
      status: "SUCCESS",
      remark:
        pnl >= 0
          ? "Trade profit credited"
          : "Trade loss debited",
      createdAt: new Date(),
    });

    await Brokerage.create({
      user_id: trade.userId,
      account_id: trade.accountId,
      trade_id: trade._id,
      symbol: trade.symbol,
      spread: typeof trade.spread === "number" ? trade.spread : 0,
      commission: typeof trade.commission === "number" ? trade.commission : 0,
      swap: typeof trade.swap === "number" ? trade.swap : 0,
      pnl,
    });

    console.log("[LEDGER][TRADE_CLOSE][OK]", {
      tradeId: trade._id.toString(),
      txnId: txn._id.toString(),
      pnl,
    });
  }

  /* =========================
     PENDING CREATE
  ========================= */

  async pendingCreate(order) {
    await PendingOrder.create({
      orderId: order.orderId,
      userId: order.userId,
      accountId: order.accountId,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      price: order.price,
      volume: order.volume,
      stopLoss: order.stopLoss ?? null,
      takeProfit: order.takeProfit ?? null,
      status: "PENDING",
      createdAt: new Date(order.createdAt),
    });

    console.log("[LEDGER][PENDING_CREATE][OK]", order.orderId);
  }

  /* =========================
     PENDING EXECUTE
  ========================= */

  async pendingExecute(order) {
    await PendingOrder.updateOne(
      { orderId: order.orderId },
      {
        $set: {
          status: "EXECUTED",
          executedAt: new Date(),
        },
      }
    );

    console.log("[LEDGER][PENDING_EXECUTE][OK]", order.orderId);
  }

  /* =========================
     PENDING CANCEL
  ========================= */

  async pendingCancel({ orderId }) {
    await PendingOrder.updateOne(
      { orderId },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      }
    );

    console.log("[LEDGER][PENDING_CANCEL][OK]", orderId);
  }

  /* =========================
     PENDING FAILED (NEW)
  ========================= */

  async pendingFailed({ orderId, reason }) {
    await PendingOrder.updateOne(
      { orderId },
      {
        $set: {
          status: "FAILED",
          failReason: reason || "EXECUTION_FAILED",
          failedAt: new Date(),
        },
      }
    );

    console.log("[LEDGER][PENDING_FAILED][OK]", orderId, reason);
  }
}

export const ledgerQueue = new LedgerQueue();
