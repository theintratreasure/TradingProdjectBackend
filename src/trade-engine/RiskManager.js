import { sendUserNotification } from "../services/notification.service.js";

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

  static cashEquity(account) {
    const direct = Number(account?.cashEquity);
    if (Number.isFinite(direct)) return direct;

    const equity = Number(account?.equity);
    const bonusLive = Number(account?.bonus_live);
    if (Number.isFinite(equity) && Number.isFinite(bonusLive)) {
      return equity - bonusLive;
    }

    return Number(account?.balance) || 0;
  }

  static capitalExhausted(account) {
    return (Number(account?.equity) || 0) <= 0;
  }

  // ===============================
  // LOSS %
  // ===============================
  static lossPercent(account) {
    const realBalance = Number(account?.balance) || 0;
    const bonusBalance = Number(account?.bonus_balance) || 0;
    const totalBalance = realBalance + bonusBalance;
    const equity = Number(account?.equity) || 0;

    if (totalBalance <= 0) return equity <= 0 ? 100 : 0;

    const loss = totalBalance - equity;

    if (loss <= 0) return 0;

    return (loss / totalBalance) * 100;
  }

  // ===============================
  // 70% WARNING
  // ===============================
  static async checkWarning(account) {

    const loss = this.lossPercent(account);

    // Already warned → skip
    if (account.__riskWarned) return;

    if (loss >= 70 && loss < 90) {

      account.__riskWarned = true;

      try {

        await sendUserNotification({
          userId: account.userId,
          title: "Risk Warning",
          message: `Your account is in ${loss.toFixed(
            2
          )}% loss. Please manage your risk.`,
          data: {
            type: "RISK_WARNING",
            accountId: account.accountId,
            loss: String(loss.toFixed(2)),
          },
        });

      } catch (err) {
        console.error("Risk warning failed:", err);
      }
    }
  }

  // ===============================
  // 90% STOPOUT
  // ===============================
  static shouldStopOut(account) {
    if (this.capitalExhausted(account)) {
      return true;
    }

    const loss = this.lossPercent(account);

    return loss >= 90;
  }
}
