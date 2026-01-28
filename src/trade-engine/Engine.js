import { v4 as uuidv4 } from "uuid";
import { AccountState } from "./AccountState.js";
import { Position } from "./Position.js";
import { RiskManager } from "./RiskManager.js";
import { engineEvents } from "./EngineEvents.js";
import { ledgerQueue } from "./LedgerQueue.js";

const DEBUG_LIVE = true;

export class Engine {
  constructor() {
    this.accounts = new Map(); // accountId -> AccountState
    this.symbols = new Map(); // symbol -> config + prices
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
  }

  loadSymbol(symbol, config) {
    this.symbols.set(symbol, {
      ...config,
      bid: 0,
      ask: 0,
      lastTickAt: 0,
    });
  }

  /* =========================
     MT5 HEDGED MARGIN ENGINE
  ========================== */

  recalcUsedMargin(account) {
    let totalMargin = 0;

    const symbolBuckets = new Map();

    for (const pos of account.positions.values()) {
      if (!symbolBuckets.has(pos.symbol)) {
        symbolBuckets.set(pos.symbol, {
          buy: 0,
          sell: 0,
          contractSize: pos.contractSize,
          leverage: pos.leverage,
        });
      }

      const bucket = symbolBuckets.get(pos.symbol);
      if (pos.side === "BUY") bucket.buy += pos.volume;
      else bucket.sell += pos.volume;
    }

    for (const [symbol, bucket] of symbolBuckets.entries()) {
      const sym = this.symbols.get(symbol);
      if (!sym) continue;

      const netVolume = Math.abs(bucket.buy - bucket.sell);
      if (netVolume <= 0) continue;

      const price = bucket.buy > bucket.sell ? sym.ask : sym.bid;

      const margin =
        (netVolume * bucket.contractSize * price) / bucket.leverage;

      totalMargin += margin;
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

    // 🔁 MT5 margin recalculation (hedge aware)
    this.recalcUsedMargin(account);

    if (account.freeMargin < 0) {
      account.positions.delete(position.positionId);
      this.recalcUsedMargin(account);
      throw new Error("Insufficient margin");
    }

    const payload = {
      userId: account.userId,
      accountId,
      ipAddress: account.lastIp || "SYSTEM",
      position: {
        positionId: position.positionId,
        symbol,
        side,
        volume,
        openPrice,
        contractSize: sym.contractSize,
        leverage,
        marginUsed: account.usedMargin,
        orderType: "MARKET",
        stopLoss,
        takeProfit,
      },
    };

    engineEvents.emit("trade_open", payload);
    ledgerQueue.enqueue("TRADE_OPEN", payload);

    return position;
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
      if (account.positions.size === 0) continue;

      let touched = false;

      for (const pos of account.positions.values()) {
        if (pos.symbol !== symbol) continue;
        pos.updatePnL(bid, ask);
        touched = true;

        if (DEBUG_LIVE) {
          console.log("[LIVE PNL][POSITION]", {
            accountId: account.accountId,
            positionId: pos.positionId,
            symbol: pos.symbol,
            side: pos.side,
            openPrice: Number(pos.openPrice.toFixed(5)),
            bid,
            ask,
            floatingPnL: Number(pos.floatingPnL.toFixed(2)),
          });
        }
      }

      if (!touched) continue;

      this.recalcUsedMargin(account);

      if (DEBUG_LIVE) {
        console.log("[LIVE ACCOUNT]", {
          accountId: account.accountId,
          balance: Number(account.balance.toFixed(2)),
          equity: Number(account.equity.toFixed(2)),
          usedMargin: Number(account.usedMargin.toFixed(2)),
          freeMargin: Number(account.freeMargin.toFixed(2)),
        });
      }

      if (RiskManager.shouldStopOut(account)) {
        this.forceCloseWorst(account);
      }
    }
  }

  /* =========================
     STOP OUT (MT5 STYLE)
  ========================== */

  forceCloseWorst(account) {
    let worst = null;

    for (const pos of account.positions.values()) {
      if (!worst || pos.floatingPnL < worst.floatingPnL) {
        worst = pos;
      }
    }

    if (!worst) return;

    const sym = this.symbols.get(worst.symbol);
    if (!sym) return;

    const closePrice = worst.side === "BUY" ? sym.bid : sym.ask;

    worst.updatePnL(sym.bid, sym.ask);

    account.positions.delete(worst.positionId);
    account.balance += worst.floatingPnL;

    this.recalcUsedMargin(account);

    const payload = {
      userId: account.userId,
      accountId: account.accountId,
      position: worst,
      closePrice,
      reason: "STOP_OUT",
    };

    engineEvents.emit("trade_close", payload);
    ledgerQueue.enqueue("TRADE_CLOSE", payload);
  }

  /* =========================
     MANUAL CLOSE
  ========================== */

  squareOffPosition({ accountId, positionId, reason = "MANUAL_CLOSE" }) {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("Account not found");

    const position = account.positions.get(positionId);
    if (!position) throw new Error("Position not found");

    const sym = this.symbols.get(position.symbol);
    if (!sym || sym.bid <= 0 || sym.ask <= 0) {
      throw new Error("Price not available");
    }

    const closePrice = position.side === "BUY" ? sym.bid : sym.ask;

    position.updatePnL(sym.bid, sym.ask);

    account.positions.delete(positionId);
    account.balance += position.floatingPnL;

    this.recalcUsedMargin(account);

    const payload = {
      userId: account.userId,
      accountId: account.accountId,
      position,
      closePrice,
      reason,
    };

    engineEvents.emit("trade_close", payload);
    ledgerQueue.enqueue("TRADE_CLOSE", payload);

    return {
      positionId,
      closePrice,
      realizedPnL: position.floatingPnL,
    };
  }
}
