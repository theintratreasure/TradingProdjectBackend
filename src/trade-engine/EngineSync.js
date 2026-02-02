// src/trade-engine/EngineSync.js

import { tradeEngine } from "./bootstrap.js";
import AccountModel from "../models/Account.model.js";

/**
 * EngineSync
 * ------------------
 * Keeps Trade Engine in sync with DB updates
 * (deposit, withdrawal, transfer, block, create, etc.)
 */
class EngineSync {
  /* ===========================
     LOAD / REFRESH ACCOUNT
  ============================ */

  static async syncAccount(accountId) {
    const account = await AccountModel.findById(accountId).lean();

    if (!account) {
      console.warn("[ENGINE_SYNC] account not found:", accountId);
      return;
    }

    tradeEngine.loadAccount({
      accountId: String(account._id),

      balance: Number(account.balance),
      leverage: Number(account.leverage),

      // ✅ FIX: user_id field
      userId: String(account.user_id),

      lastIp: account.lastIp || null,

      commission_per_lot: Number(account.commission_per_lot || 0),
      swap_charge: Number(account.swap_charge || 0),

      // ✅ IMPORTANT: spread flag
      spread_enabled: account.spread_enabled === true,

      // optional (future rules)
      account_type: account.account_type,
      status: account.status,
    });

    console.log("[ENGINE_SYNC] synced:", {
      id: String(account._id),
      balance: account.balance,
      leverage: account.leverage,
      spread: account.spread_enabled,
      status: account.status,
    });
  }

  /* ===========================
     BALANCE UPDATE
  ============================ */

  static async updateBalance(accountId, newBalance) {
    let acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      acc = tradeEngine.accounts.get(String(accountId));
      if (!acc) return;
    }

    acc.balance = Number(newBalance);
    acc.recalc();

    console.log("[ENGINE_SYNC] balance updated:", accountId, newBalance);
  }

  /* ===========================
     ACCOUNT STATUS
  ============================ */

  static async setAccountStatus(accountId, isActive) {
    const acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) return;

    acc.isBlocked = !isActive;

    if (!isActive) {
      acc.positions.clear();
      acc.pendingOrders?.clear();
    }

    console.log("[ENGINE_SYNC] status changed:", accountId, isActive);
  }

  /* ===========================
     NEW ACCOUNT
  ============================ */

  static async onAccountCreated(accountId) {
    console.log("[ENGINE_SYNC] new account:", accountId);
    await this.syncAccount(accountId);
  }

  /* ===========================
     DEPOSIT
  ============================ */

  static async onDeposit(accountId, amount) {
    let acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      acc = tradeEngine.accounts.get(String(accountId));
      if (!acc) return;
    }

    acc.balance = Number(acc.balance + amount);
    acc.recalc();

    console.log("[ENGINE_SYNC] deposit:", accountId, amount);
  }

  /* ===========================
     WITHDRAW
  ============================ */

  static async onWithdraw(accountId, amount) {
    let acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      acc = tradeEngine.accounts.get(String(accountId));
      if (!acc) return;
    }

    acc.balance = Number(acc.balance - amount);
    acc.recalc();

    console.log("[ENGINE_SYNC] withdraw:", accountId, amount);
  }

  /* ===========================
     INTERNAL TRANSFER
  ============================ */

  static async onInternalTransfer(fromId, toId, amount) {
    await this.onWithdraw(fromId, amount);
    await this.onDeposit(toId, amount);

    console.log(
      "[ENGINE_SYNC] transfer:",
      fromId,
      "->",
      toId,
      "amount:",
      amount
    );
  }

  /* ===========================
     FULL RELOAD (ADMIN / CRASH)
  ============================ */

  static async reloadAll() {
    tradeEngine.accounts.clear();

    const accounts = await AccountModel.find({
      status: "active",
    }).lean();

    for (const acc of accounts) {
      tradeEngine.loadAccount({
        accountId: String(acc._id),

        balance: Number(acc.balance),
        leverage: Number(acc.leverage),

        userId: String(acc.user_id),

        lastIp: acc.lastIp || null,

        commission_per_lot: Number(acc.commission_per_lot || 0),
        swap_charge: Number(acc.swap_charge || 0),

        spread_enabled: acc.spread_enabled === true,

        account_type: acc.account_type,
        status: acc.status,
      });
    }

    console.log("[ENGINE_SYNC] reload complete:", accounts.length);
  }
}

export default EngineSync;
