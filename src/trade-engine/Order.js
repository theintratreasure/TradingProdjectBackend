// src/trade-engine/Order.js
export class Order {
  constructor({
    orderId,
    userId,
    symbol,
    type, // MARKET | LIMIT | STOP
    side,
    price,
    volume,
    stopLoss,
    takeProfit,
  }) {
    this.orderId = orderId;
    this.userId = userId;
    this.symbol = symbol;
    this.type = type;
    this.side = side;
    this.price = price || null;
    this.volume = volume;

    this.stopLoss = stopLoss || null;
    this.takeProfit = takeProfit || null;

    this.createdAt = Date.now();
  }
}
