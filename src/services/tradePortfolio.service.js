import mongoose from "mongoose";
import Account from "../models/Account.model.js";
import Trade from "../models/Trade.model.js";

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function formatDuration(ms) {
  const safe = Number(ms);
  if (!Number.isFinite(safe) || safe <= 0) return "0m";

  const totalMinutes = Math.floor(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function toPercent(value, denominator) {
  const num = Number(value);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return round2((num / den) * 100);
}

export async function getUserPortfolioSummaryService(userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const accounts = await Account.find({ user_id: userObjectId })
    .select({
      _id: 1,
      account_type: 1,
      status: 1,
      balance: 1,
      hold_balance: 1,
      equity: 1,
      currency: 1,
    })
    .lean();

  const liveAccounts = accounts.filter((a) => a.account_type === "live");
  const demoAccounts = accounts.filter((a) => a.account_type === "demo");
  const liveAccountIds = liveAccounts.map((a) => a._id);

  const liveTotals = liveAccounts.reduce(
    (acc, item) => {
      acc.totalBalance += Number(item.balance) || 0;
      acc.totalHoldBalance += Number(item.hold_balance) || 0;
      acc.totalEquity += Number(item.equity) || 0;
      if (item.status === "active") acc.activeAccounts += 1;
      return acc;
    },
    { totalBalance: 0, totalHoldBalance: 0, totalEquity: 0, activeAccounts: 0 }
  );

  const demoBalance = round2(
    demoAccounts.reduce((sum, item) => sum + (Number(item.balance) || 0), 0)
  );

  const currencySet = new Set(
    liveAccounts.map((a) => String(a.currency || "").trim()).filter(Boolean)
  );
  const currencyList = [...currencySet];

  const tradeAgg = await Trade.aggregate([
      {
        $match: {
          userId: userObjectId,
          ...(liveAccountIds.length > 0
            ? { accountId: { $in: liveAccountIds } }
            : { accountId: { $exists: false } }),
        },
      },
      {
        $facet: {
          openStats: [
            { $match: { status: "OPEN" } },
            {
              $group: {
                _id: null,
                activeTrades: { $sum: 1 },
                openGrossPnL: { $sum: { $ifNull: ["$grossPnL", 0] } },
                openCommission: { $sum: { $ifNull: ["$commission", 0] } },
                openSwap: { $sum: { $ifNull: ["$swap", 0] } },
              },
            },
          ],
          closedStats: [
            { $match: { status: "CLOSED" } },
            {
              $group: {
                _id: null,
                totalClosedTrades: { $sum: 1 },
                wins: {
                  $sum: {
                    $cond: [{ $gt: [{ $ifNull: ["$realizedPnL", 0] }, 0] }, 1, 0],
                  },
                },
                bestTrade: { $max: { $ifNull: ["$realizedPnL", 0] } },
                worstTrade: { $min: { $ifNull: ["$realizedPnL", 0] } },
                totalRealizedPnL: { $sum: { $ifNull: ["$realizedPnL", 0] } },
                todayRealizedPnL: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$closeTime", startOfToday] },
                          { $lt: ["$closeTime", endOfToday] },
                        ],
                      },
                      { $ifNull: ["$realizedPnL", 0] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          durationStats: [
            {
              $match: {
                status: "CLOSED",
                openTime: { $type: "date" },
                closeTime: { $type: "date" },
              },
            },
            {
              $group: {
                _id: null,
                avgTradeDurationMs: { $avg: { $subtract: ["$closeTime", "$openTime"] } },
              },
            },
          ],
        },
      },
    ]);

  const tradeSummary = tradeAgg?.[0] || {};
  const openStats = tradeSummary.openStats?.[0] || {
    activeTrades: 0,
    openGrossPnL: 0,
    openCommission: 0,
    openSwap: 0,
  };
  const closedStats = tradeSummary.closedStats?.[0] || {
    totalClosedTrades: 0,
    wins: 0,
    bestTrade: 0,
    worstTrade: 0,
    totalRealizedPnL: 0,
    todayRealizedPnL: 0,
  };
  const durationStats = tradeSummary.durationStats?.[0] || {
    avgTradeDurationMs: 0,
  };

  const walletBalance = round2(liveTotals.totalBalance);
  const openProfit = round2(
    Number(openStats.openGrossPnL) -
      Number(openStats.openCommission) -
      Number(openStats.openSwap)
  );
  const totalPortfolioValue = round2(walletBalance + openProfit);
  const todayPnL = round2(Number(closedStats.todayRealizedPnL) + openProfit);

  const drawdownPercent = toPercent(openProfit, walletBalance);
  const todayChangePercent = toPercent(todayPnL, walletBalance);
  const winRate = toPercent(closedStats.wins, closedStats.totalClosedTrades);

  const currency =
    currencyList.length === 1 ? currencyList[0] : currencyList.length > 1 ? "MIXED" : "USD";

  return {
    overview: {
      totalPortfolioValue,
      todayChangePercent,
      walletBalance,
      demoBalance,
      drawdownPercent,
      activeTrades: Number(openStats.activeTrades) || 0,
      totalAccounts: liveAccounts.length,
      activeAccounts: liveTotals.activeAccounts,
      totalEquity: round2(liveTotals.totalEquity),
      totalHoldBalance: round2(liveTotals.totalHoldBalance),
      currency,
    },
    performanceSnapshot: {
      winRate,
      avgTradeDuration: formatDuration(durationStats.avgTradeDurationMs),
      avgTradeDurationMs: round2(durationStats.avgTradeDurationMs),
      bestTrade: round2(closedStats.bestTrade),
      worstTrade: round2(closedStats.worstTrade),
      totalClosedTrades: Number(closedStats.totalClosedTrades) || 0,
    },
  };
}
