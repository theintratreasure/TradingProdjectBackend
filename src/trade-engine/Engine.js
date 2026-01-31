// src/trade-engine/Engine.js

import { v4 as uuidv4 } from "uuid";
import { AccountState } from "./AccountState.js";
import { Position } from "./Position.js";
import { RiskManager } from "./RiskManager.js";
import { engineEvents } from "./EngineEvents.js";
import { ledgerQueue } from "./LedgerQueue.js";

const DEBUG_LIVE = true;

export class Engine {
  constructor() {
    this.accounts = new Map();
    this.symbols = new Map();
  }

  /* =========================
     BOOTSTRAP
  ========================== */

  loadAccount({ accountId, balance, leverage, userId, lastIp }) {
    this.accounts.set(
      accountId,
      new AccountState({
        accountId,
        balance,
        leverage,
        userId,
        lastIp,
      })
    );

    if (DEBUG_LIVE) {
      console.log("[ENGINE][ACCOUNT_LOADED]", {
        accountId,
        balance,
        leverage,
        userId,
      });
    }
  }

  loadSymbol(symbol, config) {
    this.symbols.set(symbol, {
      ...config,
      bid: 0,
      ask: 0,
      lastTickAt: 0,
    });

    if (DEBUG_LIVE) {
      console.log("[ENGINE][SYMBOL_LOADED]", symbol, config);
    }
  }

  /* =========================
     RESTORE FROM DB
  ========================== */

  loadOpenPosition(trade) {
    const account = this.accounts.get(String(trade.accountId));
    if (!account) return;

    const position = new Position({
      positionId: trade.positionId,
      accountId: String(trade.accountId),
      symbol: trade.symbol,
      side: trade.side,
      volume: trade.volume,
      openPrice: trade.openPrice,
      contractSize: trade.contractSize,
      leverage: trade.leverage,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
    });

    account.positions.set(position.positionId, position);
  }

  loadPendingOrder(order) {
    const account = this.accounts.get(String(order.accountId));
    if (!account) return;

    if (!account.pendingOrders) {
      account.pendingOrders = new Map();
    }

    account.pendingOrders.set(order.orderId, {
      orderId: order.orderId,
      userId: order.userId,
      accountId: String(order.accountId),
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      price: order.price,
      volume: order.volume,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      createdAt: order.createdAt
        ? new Date(order.createdAt).getTime()
        : Date.now(),
    });
  }

  /* =========================
     HEDGED MARGIN
  ========================== */

  recalcUsedMargin(account) {
    let totalMargin = 0;
    const buckets = new Map();

    for (const pos of account.positions.values()) {
      if (!buckets.has(pos.symbol)) {
        buckets.set(pos.symbol, {
          buy: 0,
          sell: 0,
          contractSize: pos.contractSize,
          leverage: pos.leverage,
        });
      }

      const b = buckets.get(pos.symbol);

      if (pos.side === "BUY") b.buy += pos.volume;
      else b.sell += pos.volume;
    }

    for (const [symbol, b] of buckets.entries()) {
      const sym = this.symbols.get(symbol);
      if (!sym) continue;

      const net = Math.abs(b.buy - b.sell);
      if (net <= 0) continue;

      const price = b.buy > b.sell ? sym.ask : sym.bid;

      totalMargin += (net * b.contractSize * price) / b.leverage;
    }

    account.usedMargin = totalMargin;
    account.recalc();
  }

  /* =========================
     MARKET ORDER
  ========================== */

  placeMarketOrder({ accountId, symbol, side, volume, stopLoss, takeProfit }) {
    const account = this.accounts.get(accountId);
    const sym = this.symbols.get(symbol);

    if (!account) throw new Error("Invalid trading account");
    if (!sym) throw new Error("Invalid symbol");
    if (sym.bid <= 0 || sym.ask <= 0) throw new Error("Price not ready");

    const openPrice = side === "BUY" ? sym.ask : sym.bid;
    const leverage = Math.min(account.leverage, sym.maxLeverage);

    const position = new Position({
      positionId: uuidv4(),
      accountId,
      symbol,
      side,
      volume,
      openPrice,
      contractSize: sym.contractSize,
      leverage,
      stopLoss,
      takeProfit,
    });

    account.positions.set(position.positionId, position);

    this.recalcUsedMargin(account);

    if (account.freeMargin < 0) {
      account.positions.delete(position.positionId);
      this.recalcUsedMargin(account);
      throw new Error("Insufficient margin");
    }

    ledgerQueue.enqueue("TRADE_OPEN", {
      userId: account.userId,
      accountId,
      ipAddress: account.lastIp || "SYSTEM",
      positionId: position.positionId,
      symbol,
      side,
      orderType: "MARKET",
      volume,
      contractSize: sym.contractSize,
      leverage,
      openPrice,
      stopLoss,
      takeProfit,
      marginUsed: account.usedMargin,
    });

    return position;
  }

  /* =========================
     PENDING ORDERS
  ========================== */

  placePendingOrder(data) {
    const account = this.accounts.get(data.accountId);

    if (!account) throw new Error("Invalid trading account");

    if (!account.pendingOrders) {
      account.pendingOrders = new Map();
    }

    const order = {
      orderId: uuidv4(),
      userId: account.userId,
      ...data,
      createdAt: Date.now(),
    };

    account.pendingOrders.set(order.orderId, order);

    ledgerQueue.enqueue("ORDER_PENDING_CREATE", order);

    return order;
  }

  /* =========================
     PRICE TICK
  ========================== */

  onTick(symbol, bid, ask) {
    const sym = this.symbols.get(symbol);
    if (!sym) return;

    sym.bid = bid;
    sym.ask = ask;
    sym.lastTickAt = Date.now();

    for (const account of this.accounts.values()) {

      /* === PENDING === */
      if (account.pendingOrders?.size) {
        for (const order of account.pendingOrders.values()) {

          if (order.symbol !== symbol) continue;

          const hit =
            (order.orderType === "BUY_LIMIT" && ask <= order.price) ||
            (order.orderType === "SELL_LIMIT" && bid >= order.price) ||
            (order.orderType === "BUY_STOP" && ask >= order.price) ||
            (order.orderType === "SELL_STOP" && bid <= order.price);

          if (!hit) continue;

          account.pendingOrders.delete(order.orderId);

          ledgerQueue.enqueue("ORDER_PENDING_EXECUTE", order);

          this.placeMarketOrder({
            accountId: order.accountId,
            symbol: order.symbol,
            side: order.side,
            volume: order.volume,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
          });
        }
      }

      /* === POSITIONS === */
      for (const pos of account.positions.values()) {

        if (pos.symbol !== symbol) continue;

        pos.updatePnL(bid, ask);

        const currentPrice = pos.side === "BUY" ? bid : ask;

        engineEvents.emit("LIVE_POSITION", {
          accountId: account.accountId,
          positionId: pos.positionId,
          symbol: pos.symbol,
          side: pos.side,
          openPrice: pos.openPrice,
          currentPrice,
          floatingPnL: Number(pos.floatingPnL.toFixed(2)),
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
        });

        if (
          pos.stopLoss !== null &&
          ((pos.side === "BUY" && currentPrice <= pos.stopLoss) ||
           (pos.side === "SELL" && currentPrice >= pos.stopLoss))
        ) {
          this.closePositionInternal(account, pos, "STOP_LOSS", sym);
          continue;
        }

        if (
          pos.takeProfit !== null &&
          ((pos.side === "BUY" && currentPrice >= pos.takeProfit) ||
           (pos.side === "SELL" && currentPrice <= pos.takeProfit))
        ) {
          this.closePositionInternal(account, pos, "TAKE_PROFIT", sym);
        }
      }

      this.recalcUsedMargin(account);

      engineEvents.emit("LIVE_ACCOUNT", {
        accountId: account.accountId,
        balance: Number(account.balance.toFixed(2)),
        equity: Number(account.equity.toFixed(2)),
        usedMargin: Number(account.usedMargin.toFixed(2)),
        freeMargin: Number(account.freeMargin.toFixed(2)),
      });

      if (RiskManager.shouldStopOut(account)) {
        this.forceCloseWorst(account);
      }
    }
  }

  /* =========================
     CLOSE
  ========================== */

  closePositionInternal(account, pos, reason, sym) {
    pos.updatePnL(sym.bid, sym.ask);

    account.positions.delete(pos.positionId);

    account.balance += pos.floatingPnL;

    this.recalcUsedMargin(account);

    ledgerQueue.enqueue("TRADE_CLOSE", {
      userId: account.userId,
      accountId: account.accountId,
      positionId: pos.positionId,
      closePrice: pos.side === "BUY" ? sym.bid : sym.ask,
      realizedPnL: Number(pos.floatingPnL.toFixed(2)),
      reason,
    });
  }

  forceCloseWorst(account) {
    let worst = null;

    for (const pos of account.positions.values()) {
      if (!worst || pos.floatingPnL < worst.floatingPnL) {
        worst = pos;
      }
    }

    if (!worst) return;

    const sym = this.symbols.get(worst.symbol);

    this.closePositionInternal(account, worst, "STOP_OUT", sym);
  }

  squareOffPosition({ accountId, positionId, reason = "MANUAL" }) {
    const account = this.accounts.get(accountId);

    if (!account) throw new Error("Account not found");

    const pos = account.positions.get(positionId);

    if (!pos) throw new Error("Position not found");

    const sym = this.symbols.get(pos.symbol);

    this.closePositionInternal(account, pos, reason, sym);

    return {
      positionId,
      realizedPnL: Number(pos.floatingPnL.toFixed(2)),
    };
  }
}
