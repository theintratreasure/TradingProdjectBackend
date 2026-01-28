// src/trade-engine/Position.js
export class Position {
  constructor({
    positionId,
    accountId,
    symbol,
    side,
    volume,
    openPrice,
    contractSize,
    leverage,
    stopLoss,
    takeProfit,
  }) {
    this.positionId = positionId;
    this.accountId = accountId;
    this.symbol = symbol;
    this.side = side;

    this.volume = volume;
    this.openPrice = openPrice;
    this.contractSize = contractSize;
    this.leverage = leverage;

    this.stopLoss = stopLoss || null;
    this.takeProfit = takeProfit || null;

    this.marginUsed = 0;
    this.floatingPnL = 0;
    this.openTime = Date.now();
  }

  updatePnL(bid, ask) {
    if (this.side === "BUY") {
      this.floatingPnL =
        (bid - this.openPrice) * this.volume * this.contractSize;
    } else {
      this.floatingPnL =
        (this.openPrice - ask) * this.volume * this.contractSize;
    }
  }
}
