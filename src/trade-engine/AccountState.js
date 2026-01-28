// src/trade-engine/AccountState.js
export class AccountState {
  constructor({ accountId, balance, leverage }) {
    this.accountId = accountId;

    this.balance = Number(balance) || 0;
    this.leverage = Number(leverage) || 2000;

    this.positions = new Map(); // positionId -> Position

    this.usedMargin = 0;
    this.equity = this.balance;
    this.freeMargin = this.balance;
  }

  /**
   * Recalculate equity & free margin
   */
  recalc() {
    let floatingPnL = 0;

    for (const pos of this.positions.values()) {
      floatingPnL += pos.floatingPnL;
    }

    this.equity = this.balance + floatingPnL;
    this.freeMargin = this.equity - this.usedMargin;
  }
}
