// src/trade-engine/bootstrap.js

import { Engine } from "./Engine.js";

import Trade from "../models/Trade.model.js";
import PendingOrder from "../models/PendingOrder.model.js";

export const tradeEngine = new Engine();

export async function bootstrapEngine({ accounts, symbols }) {
  /* =========================
     LOAD ACCOUNTS
  ========================= */

  for (const acc of accounts) {
    tradeEngine.loadAccount({
      accountId: String(acc._id),
      balance: acc.balance,
      leverage: acc.leverage,
      userId: String(acc._id), // required
      lastIp: acc.lastIp || "SYSTEM",
      commission_per_lot: Number(acc.commission_per_lot) || 0,
      swap_charge: Number(acc.swap_charge) || 0,
    });
  }

  /* =========================
     LOAD SYMBOLS
  ========================= */

  for (const sym of symbols) {
    tradeEngine.loadSymbol(sym.code, {
      contractSize: sym.contractSize,
      maxLeverage: sym.maxLeverage || 2000,
    });
  }

  /* =========================
     RESTORE OPEN TRADES
  ========================= */

  const openTrades = await Trade.find({
    status: "OPEN",
  }).lean();

  console.log("[BOOTSTRAP] Open trades:", openTrades.length);

  for (const trade of openTrades) {
    tradeEngine.loadOpenPosition(trade);
  }

  /* =========================
     RESTORE PENDING ORDERS
  ========================= */

  const pendingOrders = await PendingOrder.find({
    status: "PENDING",
  }).lean();

  console.log("[BOOTSTRAP] Pending orders:", pendingOrders.length);

  for (const order of pendingOrders) {
    tradeEngine.loadPendingOrder(order);
  }

  /* =========================
     RECALCULATE MARGIN
  ========================= */

  for (const account of tradeEngine.accounts.values()) {
    tradeEngine.recalcUsedMargin(account);
  }

  console.log("[BOOTSTRAP] Engine fully restored");

  return tradeEngine;
}
