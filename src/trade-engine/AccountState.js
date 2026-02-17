// src/trade-engine/AccountState.js
export class AccountState {
  constructor({
    accountId,
    balance,
    leverage,
    bonus_balance = 0,
    bonus_percent = 0,
    bonus_percent_override = null,
  }) {
    this.accountId = accountId;

    this.balance = Number(balance) || 0;
    this.leverage = Number(leverage) || 2000;

    this.bonus_balance = Number(bonus_balance) || 0;
    this.bonus_percent =
      typeof bonus_percent === "number" && Number.isFinite(bonus_percent)
        ? bonus_percent
        : 0;
    this.bonus_percent_override =
      typeof bonus_percent_override === "number"
        ? bonus_percent_override
        : bonus_percent_override === null
          ? null
          : null;
    this.bonus_live = Number(this.bonus_balance) || 0;

    this.positions = new Map(); // positionId -> Position

    this.usedMargin = 0;
    this.equity = this.balance + this.bonus_live;
    this.freeMarginRaw = this.equity;
    this.freeMargin = this.equity;
  }

  /**
   * Recalculate equity & free margin
   */
  recalc() {
    let floatingPnL = 0;

    for (const pos of this.positions.values()) {
      floatingPnL += pos.floatingPnL;
    }

    const bonusBalance = Number(this.bonus_balance) || 0;
    const bonusPercent = Number(this.bonus_percent) || 0;

    let bonusLive = bonusBalance;
    if (floatingPnL < 0 && bonusPercent > 0 && bonusBalance > 0) {
      const reduce = Math.abs(floatingPnL) * (bonusPercent / 100);
      bonusLive = Math.max(0, bonusBalance - reduce);
    }

    this.bonus_live = Number.isFinite(bonusLive)
      ? Number(bonusLive.toFixed(8))
      : 0;

    this.equity = this.balance + this.bonus_live + floatingPnL;
    this.freeMarginRaw = this.equity - this.usedMargin;
    this.freeMargin = this.freeMarginRaw < 0 ? 0 : this.freeMarginRaw;
  }
}
