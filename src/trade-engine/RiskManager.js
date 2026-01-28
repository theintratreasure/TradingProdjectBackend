// src/trade-engine/RiskManager.js
export class RiskManager {
  static calcMargin({
    price,
    volume,
    contractSize,
    leverage,
  }) {
    return (price * volume * contractSize) / leverage;
  }

  static marginLevel(account) {
    if (account.usedMargin <= 0) return 1000;
    return (account.equity / account.usedMargin) * 100;
  }

  static shouldStopOut(account) {
    // 90% loss cut
    return account.equity <= account.balance * 0.1;
  }
}
