import Account from "../models/Account.model.js";
import Trade from "../models/Trade.model.js";
import Transaction from "../models/Transaction.model.js";
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

    if (event === "TRADE_OPEN") {
      await this.tradeOpen(payload);
      return;
    }

    if (event === "TRADE_CLOSE") {
      await this.tradeClose(payload);
      return;
    }

    console.warn("[LEDGER] UNKNOWN EVENT:", event);
  }

  /* =========================
     TRADE OPEN (DB WRITE)
  ========================= */

  async tradeOpen({ userId, accountId, position, ipAddress }) {
    console.log("[LEDGER][OPEN] writing trade to DB", {
      accountId,
      symbol: position.symbol,
    });

    // ✅ FIX: resolve userId safely
    let resolvedUserId = userId;

    if (!resolvedUserId) {
      const account = await Account.findById(accountId).select("user_id");
      if (!account || !account.user_id) {
        throw new Error(
          "Ledger tradeOpen failed: user_id not found for account"
        );
      }
      resolvedUserId = String(account.user_id);
    }

    const trade = await Trade.create({
      userId: resolvedUserId,
      accountId,
      ipAddress: ipAddress || "SYSTEM",
      symbol: position.symbol,
      side: position.side,
      orderType: position.orderType || "MARKET",
      volume: position.volume,
      contractSize: position.contractSize,
      leverage: position.leverage,
      openPrice: position.openPrice,
      stopLoss: position.stopLoss || null,
      takeProfit: position.takeProfit || null,
      marginUsed: position.marginUsed,
      status: "OPEN",
      openTime: new Date(),
    });

    console.log("[LEDGER][OPEN][SUCCESS]", trade._id.toString());
  }

  /* =========================
     TRADE CLOSE (DB WRITE)
  ========================= */

  async tradeClose({ userId, accountId, position, closePrice, reason }) {
    console.log("[LEDGER][CLOSE] closing trade", {
      accountId,
      symbol: position.symbol,
    });

    const priceDiff =
      position.side === "BUY"
        ? closePrice - position.openPrice
        : position.openPrice - closePrice;

    const realizedPnL =
      priceDiff * position.volume * position.contractSize;

    // 1️⃣ UPDATE TRADE
    const trade = await Trade.findOneAndUpdate(
      {
        accountId,
        status: "OPEN",
        symbol: position.symbol,
      },
      {
        $set: {
          closePrice,
          realizedPnL,
          closeReason: reason,
          closeTime: new Date(),
          status: "CLOSED",
        },
      },
      { new: true }
    );

    if (!trade) {
      console.error("[LEDGER][CLOSE][ERROR] Trade not found");
      return;
    }

    // 2️⃣ UPDATE ACCOUNT BALANCE
    const account = await Account.findById(accountId);
    if (!account) {
      console.error("[LEDGER][CLOSE][ERROR] Account not found");
      return;
    }

    const newBalance = account.balance + realizedPnL;

    await Account.updateOne(
      { _id: accountId },
      { $set: { balance: newBalance } }
    );

    // 3️⃣ INSERT TRANSACTION
    const txn = await Transaction.create({
      user: userId || trade.userId,
      account: accountId,
      type: realizedPnL >= 0 ? "TRADE_PROFIT" : "TRADE_LOSS",
      amount: Math.abs(realizedPnL),
      balanceAfter: newBalance,
      referenceType: "ORDER",
      referenceId: trade._id,
      status: "SUCCESS",
      remark:
        realizedPnL >= 0
          ? "Trade profit credited"
          : "Trade loss debited",
    });

    console.log("[LEDGER][CLOSE][SUCCESS]", {
      tradeId: trade._id.toString(),
      txnId: txn._id.toString(),
      realizedPnL,
    });
  }
}

export const ledgerQueue = new LedgerQueue();
