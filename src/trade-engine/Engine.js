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

    console.log("[ENGINE][MARKET_OPEN]", {
      accountId,
      symbol,
      side,
      volume,
      openPrice,
      stopLoss,
      takeProfit,
    });

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

    console.log("[ENGINE][PENDING_CREATED]", order);

    ledgerQueue.enqueue("ORDER_PENDING_CREATE", order);
    return order;
  }

  /* =========================
     PRICE TICK (FULL LIVE DEBUG)
  ========================== */

  onTick(symbol, bid, ask) {
    const sym = this.symbols.get(symbol);
    if (!sym) return;

    sym.bid = bid;
    sym.ask = ask;
    sym.lastTickAt = Date.now();

    console.log("[TICK]", { symbol, bid, ask });

    for (const account of this.accounts.values()) {

      /* ===== PENDING ORDERS DEBUG ===== */
      if (account.pendingOrders?.size) {
        for (const order of account.pendingOrders.values()) {
          if (order.symbol !== symbol) continue;

          const currentPrice =
            order.side === "BUY" ? ask : bid;

          const gap = Number(
            Math.abs(currentPrice - order.price).toFixed(5)
          );

          const willHit =
            (order.orderType === "BUY_LIMIT" && ask <= order.price) ||
            (order.orderType === "SELL_LIMIT" && bid >= order.price) ||
            (order.orderType === "BUY_STOP" && ask >= order.price) ||
            (order.orderType === "SELL_STOP" && bid <= order.price);

          console.log("[LIVE][PENDING]", {
            accountId: account.accountId,
            orderId: order.orderId,
            type: order.orderType,
            triggerPrice: order.price,
            currentPrice,
            gapToTrigger: gap,
            willHit,
          });

          if (!willHit) continue;

          console.log("[ENGINE][PENDING_HIT]", order.orderId);

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

      /* ===== OPEN POSITIONS DEBUG ===== */
      if (account.positions.size === 0) continue;

      for (const pos of account.positions.values()) {
        if (pos.symbol !== symbol) continue;

        pos.updatePnL(bid, ask);
        const price = pos.side === "BUY" ? bid : ask;

        const slGap =
          pos.stopLoss != null
            ? Number(Math.abs(price - pos.stopLoss).toFixed(5))
            : null;

        const tpGap =
          pos.takeProfit != null
            ? Number(Math.abs(pos.takeProfit - price).toFixed(5))
            : null;

        console.log("[LIVE][POSITION]", {
          accountId: account.accountId,
          positionId: pos.positionId,
          side: pos.side,
          openPrice: pos.openPrice,
          currentPrice: price,
          floatingPnL: Number(pos.floatingPnL.toFixed(2)),
          slGap,
          tpGap,
        });

        if (
          pos.stopLoss !== null &&
          ((pos.side === "BUY" && price <= pos.stopLoss) ||
           (pos.side === "SELL" && price >= pos.stopLoss))
        ) {
          console.log("[ENGINE][STOP_LOSS_HIT]", pos.positionId);
          this.closePositionInternal(account, pos, "STOP_LOSS", sym);
          continue;
        }

        if (
          pos.takeProfit !== null &&
          ((pos.side === "BUY" && price >= pos.takeProfit) ||
           (pos.side === "SELL" && price <= pos.takeProfit))
        ) {
          console.log("[ENGINE][TAKE_PROFIT_HIT]", pos.positionId);
          this.closePositionInternal(account, pos, "TAKE_PROFIT", sym);
        }
      }

      this.recalcUsedMargin(account);

      console.log("[LIVE][ACCOUNT]", {
        accountId: account.accountId,
        balance: Number(account.balance.toFixed(2)),
        equity: Number(account.equity.toFixed(2)),
        usedMargin: Number(account.usedMargin.toFixed(2)),
        freeMargin: Number(account.freeMargin.toFixed(2)),
      });

      if (RiskManager.shouldStopOut(account)) {
        console.log("[ENGINE][STOP_OUT_TRIGGERED]", account.accountId);
        this.forceCloseWorst(account);
      }
    }
  }

  /* =========================
     INTERNAL CLOSE
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
