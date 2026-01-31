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
      }),
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
      expireType: order.expireType || "GTC",
      expireAt: order.expireAt ? new Date(order.expireAt).getTime() : null,
      createdAt: order.createdAt
        ? new Date(order.createdAt).getTime()
        : Date.now(),
    });

    // Emit a flattened LIVE_PENDING payload so websocket receives the same
    // style of message as LIVE_POSITION (i.e. order fields directly).
    try {
      engineEvents.emit("LIVE_PENDING", {
        accountId: String(order.accountId),
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        price: Number(order.price),
        volume: Number(order.volume),
        stopLoss: order.stopLoss !== undefined ? order.stopLoss : null,
        takeProfit: order.takeProfit !== undefined ? order.takeProfit : null,
        expireType: order.expireType || "GTC",
        expireAt: order.expireAt ? new Date(order.expireAt).getTime() : null,
        createdAt: order.createdAt ? new Date(order.createdAt).getTime() : Date.now(),
        status: "PENDING",
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_PENDING failed", err);
    }
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
     - Added optional overrideOpenPrice to support pending->market transitions
  ========================== */

  placeMarketOrder({ accountId, symbol, side, volume, stopLoss, takeProfit, overrideOpenPrice = null }) {
    const account = this.accounts.get(accountId);
    const sym = this.symbols.get(symbol);

    if (!account) throw new Error("Invalid trading account");
    if (!sym) throw new Error("Invalid symbol");
    if (sym.bid <= 0 || sym.ask <= 0) throw new Error("Price not ready");

    // If overrideOpenPrice provided (e.g. for pending fill at its limit), prefer it
    const openPrice = typeof overrideOpenPrice === "number" ? overrideOpenPrice : (side === "BUY" ? sym.ask : sym.bid);
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

    // Ledger: record trade open (successful)
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

    // Emit live updates so websocket can show the new position immediately
    try {
      engineEvents.emit("LIVE_POSITION", {
        accountId: account.accountId,
        positionId: position.positionId,
        volume: position.volume,
        openTime: position.openTime || Date.now(),
        symbol: position.symbol,
        side: position.side,
        openPrice: position.openPrice,
        currentPrice: position.openPrice,
        floatingPnL: 0,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_POSITION failed", err);
    }

    // Also emit account snapshot
    try {
      engineEvents.emit("LIVE_ACCOUNT", {
        accountId: account.accountId,
        balance: Number(account.balance.toFixed(2)),
        equity: Number(account.equity.toFixed(2)),
        usedMargin: Number(account.usedMargin.toFixed(2)),
        freeMargin: Number(account.freeMargin.toFixed(2)),
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_ACCOUNT failed", err);
    }

    return position;
  }

  /* =========================
     PLACE PENDING ORDER
  ========================== */

  placePendingOrder({
    userId,
    accountId,
    symbol,
    side,
    orderType,
    price,
    volume,
    stopLoss,
    takeProfit,
    expireType = "GTC",
    expireAt = null,
  }) {
    const account = this.accounts.get(accountId);
    const sym = this.symbols.get(symbol);

    if (!account) throw new Error("Invalid trading account");
    if (!sym) throw new Error("Invalid symbol");

    if (
      !["BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"].includes(orderType)
    ) {
      throw new Error("Invalid pending order type");
    }

    if (!account.pendingOrders) {
      account.pendingOrders = new Map();
    }

    const orderId = uuidv4();

    const order = {
      orderId,
      userId,
      accountId,
      symbol,
      side,
      orderType,
      price: Number(price),
      volume: Number(volume),
      stopLoss: stopLoss !== undefined ? stopLoss : null,
      takeProfit: takeProfit !== undefined ? takeProfit : null,
      expireType,
      expireAt: expireAt ? new Date(expireAt).getTime() : null,
      createdAt: Date.now(),
    };

    // Save in memory
    account.pendingOrders.set(orderId, order);

    // Save in DB / Ledger (create)
    ledgerQueue.enqueue("ORDER_PENDING_CREATE", order);

    // Emit LIVE_PENDING so clients see pending immediately (and treat as ongoing update)
    try {
      engineEvents.emit("LIVE_PENDING", {
        ...order,
        accountId: String(accountId),
        status: "PENDING",
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_PENDING failed (placePendingOrder)", err);
    }

    return order;
  }

  /* =========================
     MODIFY PENDING ORDER
  ========================== */

  modifyPendingOrder({ accountId, orderId, price, stopLoss, takeProfit }) {
    const account = this.accounts.get(accountId);

    if (!account) throw new Error("Invalid account");
    if (!account.pendingOrders) throw new Error("No pending orders");

    const order = account.pendingOrders.get(orderId);

    if (!order) throw new Error("Pending order not found");

    if (typeof price === "number") order.price = price;
    if (typeof stopLoss === "number") order.stopLoss = stopLoss;
    if (typeof takeProfit === "number") order.takeProfit = takeProfit;

    ledgerQueue.enqueue("ORDER_PENDING_MODIFY", order);

    // Emit updated snapshot for this pending order
    try {
      engineEvents.emit("LIVE_PENDING", {
        ...order,
        accountId: String(accountId),
        status: "PENDING_MODIFIED",
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_PENDING failed (modifyPendingOrder)", err);
    }

    return order;
  }

  /* =========================
     CANCEL PENDING ORDER
  ========================== */

  cancelPendingOrder({ accountId, orderId }) {
    const account = this.accounts.get(accountId);

    if (!account) throw new Error("Invalid account");
    if (!account.pendingOrders) throw new Error("No pending orders");

    const order = account.pendingOrders.get(orderId);

    if (!order) throw new Error("Pending order not found");

    account.pendingOrders.delete(orderId);

    ledgerQueue.enqueue("ORDER_PENDING_CANCEL", {
      orderId,
      reason: "MANUAL",
    });

    try {
      engineEvents.emit("LIVE_PENDING_CANCEL", {
        accountId,
        orderId,
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_PENDING_CANCEL failed", err);
    }

    return true;
  }

  /* =========================
     PRICE TICK
     - On each tick we update symbol prices, emit live updates for matching
       pending orders (so WS sees them continuously), evaluate hits,
       execute safely (placeMarketOrder first, then ledger enqueue & emits)
  ========================== */

  async onTick(symbol, bid, ask) {
    const sym = this.symbols.get(symbol);
    if (!sym) return;

    sym.bid = bid;
    sym.ask = ask;
    sym.lastTickAt = Date.now();

    if (DEBUG_LIVE) {
      console.log("[ENGINE][TICK]", symbol, "bid", bid, "ask", ask, "accounts", this.accounts.size);
    }

    for (const account of this.accounts.values()) {
      /* =====================
         PENDING ORDERS
      ====================== */

      if (account.pendingOrders?.size) {
        const now = Date.now();

        // iterate over a copy-safe way so deletion during loop is safe
        for (const order of Array.from(account.pendingOrders.values())) {
          // expire handling
          if (order.expireAt && now >= order.expireAt) {
            account.pendingOrders.delete(order.orderId);

            ledgerQueue.enqueue("ORDER_PENDING_CANCEL", {
              orderId: order.orderId,
              reason: "EXPIRED",
            });

            try {
              engineEvents.emit("LIVE_PENDING_CANCEL", {
                accountId: account.accountId,
                orderId: order.orderId,
                reason: "EXPIRED",
              });
            } catch (err) {
              console.error("[ENGINE] emit LIVE_PENDING_CANCEL failed (expire)", err);
            }

            continue;
          }

          // Only emit/update pending orders that are relevant to this tick symbol.
          // This keeps updates targeted and avoids emitting all pendings for every tick.
          if (order.symbol === symbol) {
            // Emit a continuous LIVE_PENDING update so clients keep seeing it live (like positions)
            try {
              engineEvents.emit("LIVE_PENDING", {
                ...order,
                accountId: account.accountId,
                currentBid: bid,
                currentAsk: ask,
                ageMs: Date.now() - (order.createdAt || Date.now()),
                status: "PENDING",
              });
            } catch (err) {
              console.error("[ENGINE] emit LIVE_PENDING failed (tick update)", err);
            }
          }

          // skip checks for non-matching symbol
          if (order.symbol !== symbol) continue;

          // check hit conditions
          const hit =
            (order.orderType === "BUY_LIMIT" && ask <= order.price) ||
            (order.orderType === "SELL_LIMIT" && bid >= order.price) ||
            (order.orderType === "BUY_STOP" && ask >= order.price) ||
            (order.orderType === "SELL_STOP" && bid <= order.price);

          if (!hit) continue;

          // We got a hit — try to execute the pending order safely.
          // Attempt to place a market order. Use order.price as override if you want the
          // openPrice to be the pending price (safer for limit), otherwise market price will apply.
          try {
            // Attempt place market order (this will throw if insufficient margin or price not ready)
            const position = this.placeMarketOrder({
              accountId: order.accountId,
              symbol: order.symbol,
              side: order.side,
              volume: order.volume,
              stopLoss: order.stopLoss,
              takeProfit: order.takeProfit,
              overrideOpenPrice: order.price, // prefer pending price as filled price
            });

            // remove from memory (only after successful placeMarketOrder)
            account.pendingOrders.delete(order.orderId);

            // record pending-execute in ledger AFTER successful fill
            ledgerQueue.enqueue("ORDER_PENDING_EXECUTE", {
              ...order,
              executedAt: Date.now(),
              executedPositionId: position.positionId,
            });

            // Inform clients that pending executed (useful to remove from UI)
            try {
              engineEvents.emit("LIVE_PENDING_EXECUTE", {
                accountId: account.accountId,
                orderId: order.orderId,
                symbol: order.symbol,
                side: order.side,
                orderType: order.orderType,
                price: order.price,
                volume: order.volume,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                createdAt: order.createdAt,
                executedAt: Date.now(),
                positionId: position.positionId,
              });
            } catch (err) {
              console.error("[ENGINE] emit LIVE_PENDING_EXECUTE failed", err);
            }

            // Also emit an ORDER_EXECUTED event tying order->position
            try {
              engineEvents.emit("ORDER_EXECUTED", {
                accountId: account.accountId,
                orderId: order.orderId,
                positionId: position.positionId,
              });
            } catch (err) {
              console.error("[ENGINE] emit ORDER_EXECUTED failed", err);
            }
          } catch (err) {
            // Execution failed — record failure and notify clients
            console.error("[ENGINE] Failed to execute pending order into market:", err && err.message ? err.message : err);

            ledgerQueue.enqueue("ORDER_PENDING_EXECUTE_FAILED", {
              orderId: order.orderId,
              reason: err && err.message ? err.message : "EXECUTION_FAILED",
            });

            try {
              engineEvents.emit("LIVE_PENDING_EXECUTE_FAILED", {
                accountId: account.accountId,
                orderId: order.orderId,
                reason: err && err.message ? err.message : "EXECUTION_FAILED",
              });
            } catch (emitErr) {
              console.error("[ENGINE] emit LIVE_PENDING_EXECUTE_FAILED failed", emitErr);
            }
          }
        }
      }

      /* =====================
         POSITIONS
      ====================== */

      for (const pos of account.positions.values()) {
        if (pos.symbol !== symbol) continue;

        pos.updatePnL(bid, ask);

        const currentPrice = pos.side === "BUY" ? bid : ask;

        try {
          engineEvents.emit("LIVE_POSITION", {
            accountId: account.accountId,
            positionId: pos.positionId,
            volume: pos.volume,
            openTime: pos.openTime,
            symbol: pos.symbol,
            side: pos.side,
            openPrice: pos.openPrice,
            currentPrice,
            floatingPnL: Number(pos.floatingPnL.toFixed(2)),
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
          });
        } catch (err) {
          console.error("[ENGINE] emit LIVE_POSITION failed", err);
        }

        /* === STOP LOSS === */
        if (
          pos.stopLoss !== null &&
          ((pos.side === "BUY" && currentPrice <= pos.stopLoss) ||
            (pos.side === "SELL" && currentPrice >= pos.stopLoss))
        ) {
          this.closePositionInternal(account, pos, "STOP_LOSS", sym);
          continue;
        }

        /* === TAKE PROFIT === */
        if (
          pos.takeProfit !== null &&
          ((pos.side === "BUY" && currentPrice >= pos.takeProfit) ||
            (pos.side === "SELL" && currentPrice <= pos.takeProfit))
        ) {
          this.closePositionInternal(account, pos, "TAKE_PROFIT", sym);
        }
      }

      /* =====================
         ACCOUNT UPDATE
      ====================== */

      this.recalcUsedMargin(account);

      try {
        engineEvents.emit("LIVE_ACCOUNT", {
          accountId: account.accountId,
          balance: Number(account.balance.toFixed(2)),
          equity: Number(account.equity.toFixed(2)),
          usedMargin: Number(account.usedMargin.toFixed(2)),
          freeMargin: Number(account.freeMargin.toFixed(2)),
        });
      } catch (err) {
        console.error("[ENGINE] emit LIVE_ACCOUNT failed", err);
      }

      /* =====================
         RISK MANAGEMENT
      ====================== */

      // 70% Warning
      await RiskManager.checkWarning(account);

      // 90% Stopout
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

    // Emit account & position removal (position removed so send minimal info)
    try {
      engineEvents.emit("LIVE_POSITION_CLOSED", {
        accountId: account.accountId,
        positionId: pos.positionId,
        realizedPnL: Number(pos.floatingPnL.toFixed(2)),
        reason,
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_POSITION_CLOSED failed", err);
    }

    try {
      engineEvents.emit("LIVE_ACCOUNT", {
        accountId: account.accountId,
        balance: Number(account.balance.toFixed(2)),
        equity: Number(account.equity.toFixed(2)),
        usedMargin: Number(account.usedMargin.toFixed(2)),
        freeMargin: Number(account.freeMargin.toFixed(2)),
      });
    } catch (err) {
      console.error("[ENGINE] emit LIVE_ACCOUNT failed (closePosition)", err);
    }
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
