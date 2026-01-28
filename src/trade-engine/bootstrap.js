// src/trade-engine/bootstrap.js
import { Engine } from "./Engine.js";

export const tradeEngine = new Engine();

/**
 * Load all trading state into RAM (ONCE at startup)
 */
export async function bootstrapEngine({ accounts, symbols }) {
  for (const acc of accounts) {
    tradeEngine.loadAccount({
      accountId: String(acc._id),   // 🔥 FIX: Mongo _id
      balance: acc.balance,
      leverage: acc.leverage,
    });
  }

  for (const sym of symbols) {
    tradeEngine.loadSymbol(sym.code, {
      contractSize: sym.contractSize,
      maxLeverage: sym.maxLeverage || 2000,
    });
  }

  return tradeEngine;
}
