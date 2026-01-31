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

  // ===============================
  // LOSS %
  // ===============================
  static lossPercent(account) {

    if (account.balance <= 0) return 100;

    const loss = account.balance - account.equity;

    if (loss <= 0) return 0;

    return (loss / account.balance) * 100;
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

    const loss = this.lossPercent(account);

    return loss >= 90;
  }
}
