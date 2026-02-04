import Trade from "../models/Trade.model.js";
import PendingOrder from "../models/PendingOrder.model.js";
import User from "../models/User.model.js";

export const getTradeAdminSummaryService = async () => {
  const [activePositions, pendingOrders, activeUsers, activeTradingAccountIds] =
    await Promise.all([
      Trade.countDocuments({ status: "OPEN" }),
      PendingOrder.countDocuments({ status: "PENDING" }),
      User.countDocuments({}),
      Trade.distinct("accountId", { status: "OPEN" })
    ]);

  return {
    activePositions,
    activePendingOrders: pendingOrders,
    activeUsers,
    activeTradingAccounts: Array.isArray(activeTradingAccountIds)
      ? activeTradingAccountIds.length
      : 0
  };
};
