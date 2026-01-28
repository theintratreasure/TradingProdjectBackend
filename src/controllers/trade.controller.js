import { tradeEngine } from "../trade-engine/bootstrap.js";
import Account from "../models/Account.model.js";

export async function placeMarketOrderController(req, res) {
  try {
    const userId = String(req.user._id);

    const {
      accountId,
      symbol,
      side,
      volume,
      stopLoss,
      takeProfit,
    } = req.body;

    if (!accountId || !symbol || !side || !volume) {
      return res.status(400).json({
        status: "error",
        message: "accountId, symbol, side and volume are required",
      });
    }

    if (side !== "BUY" && side !== "SELL") {
      return res.status(400).json({
        status: "error",
        message: "side must be BUY or SELL",
      });
    }

    // 🔐 SECURITY: verify account belongs to logged-in user
    const ownsAccount = await Account.exists({
      _id: accountId,
      user_id: userId,
      status: "active",
    });

    if (!ownsAccount) {
      return res.status(403).json({
        status: "error",
        message: "Account does not belong to user",
      });
    }

    const position = tradeEngine.placeMarketOrder({
      accountId: String(accountId), // ✅ FIX
      symbol: String(symbol).toUpperCase(),
      side,
      volume: Number(volume),
      stopLoss: typeof stopLoss === "number" ? stopLoss : null,
      takeProfit: typeof takeProfit === "number" ? takeProfit : null,
    });

    return res.json({
      status: "success",
      data: {
        positionId: position.positionId,
        accountId,
        symbol: position.symbol,
        side: position.side,
        openPrice: position.openPrice,
        volume: position.volume,
      },
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message || "Trade failed",
    });
  }
}
export const closePosition = (req, res) => {
  try {
    const { accountId, positionId } = req.body;

    if (!accountId || !positionId) {
      return res.status(400).json({
        status: "error",
        message: "accountId and positionId required",
      });
    }

    const result = tradeEngine.squareOffPosition({
      accountId,
      positionId,
      reason: "MANUAL_CLOSE",
    });

    return res.json({
      status: "success",
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
};
