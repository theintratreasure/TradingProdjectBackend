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

    if (!account) return;

    tradeEngine.loadAccount({
      accountId: String(account._id),
      balance: Number(account.balance),
      leverage: account.leverage,
      userId: String(account.userId),
      lastIp: account.lastIp,

      commission_per_lot: Number(account.commission_per_lot || 0),
      swap_charge: Number(account.swap_charge || 0),
    });
  }

  /* ===========================
     BALANCE UPDATE
  ============================ */

  static async updateBalance(accountId, newBalance) {
    const acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      return;
    }

    acc.balance = Number(newBalance);

    acc.recalc();
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
  }

  /* ===========================
     NEW ACCOUNT
  ============================ */

  static async onAccountCreated(accountId) {
    await this.syncAccount(accountId);
  }

  /* ===========================
     DEPOSIT
  ============================ */

  static async onDeposit(accountId, amount) {
    const acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      return;
    }

    acc.balance = Number(acc.balance + amount);

    acc.recalc();
  }

  /* ===========================
     WITHDRAW
  ============================ */

  static async onWithdraw(accountId, amount) {
    const acc = tradeEngine.accounts.get(String(accountId));

    if (!acc) {
      await this.syncAccount(accountId);
      return;
    }

    acc.balance = Number(acc.balance - amount);

    acc.recalc();
  }

  /* ===========================
     INTERNAL TRANSFER
  ============================ */

  static async onInternalTransfer(fromId, toId, amount) {
    await this.onWithdraw(fromId, amount);
    await this.onDeposit(toId, amount);
  }

  /* ===========================
     FULL RELOAD (ADMIN / CRASH)
  ============================ */

  static async reloadAll() {
    tradeEngine.accounts.clear();

    const accounts = await AccountModel.find({ isActive: true }).lean();

    for (const acc of accounts) {
      tradeEngine.loadAccount({
        accountId: String(acc._id),
        balance: Number(acc.balance),
        leverage: acc.leverage,
        userId: String(acc.userId),
        lastIp: acc.lastIp,

        commission_per_lot: Number(acc.commission_per_lot || 0),
        swap_charge: Number(acc.swap_charge || 0),
      });
    }

    console.log("[ENGINE_SYNC] Reloaded:", accounts.length);
  }
}

export default EngineSync;
