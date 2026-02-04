import Instrument from "../models/Instrument.model.js";
import Account from "../models/Account.model.js";
import { MarketSchedule } from "../models/MarketSchedule.model.js";

const getMarketScheduleBySegment = async (segmentRaw) => {
  const segment = String(segmentRaw || "").trim().toLowerCase();

  if (!segment) {
    throw new Error("segment is required");
  }

  const schedule = await MarketSchedule.findOne({ segment })
    .select("segment timezone openTime closeTime weeklyOff holidays -_id")
    .lean();

  if (!schedule) {
    throw new Error("Market schedule not found");
  }

  return schedule;
};

export const getPropertyBySymbolService = async (symbolRaw, accountId) => {
  const symbol = String(symbolRaw || "").trim().toUpperCase();

  if (!symbol) {
    throw new Error("symbol is required");
  }

  if (!accountId) {
    throw new Error("accountId is required");
  }

  const [instrument, account] = await Promise.all([
    Instrument.findOne({ code: symbol }).select("-_id").lean(),
    Account.findById(accountId).select("swap_enabled swap_charge").lean()
  ]);

  if (!instrument) {
    throw new Error("Instrument not found");
  }

  if (!account) {
    throw new Error("Account not found");
  }

  const marketSchedule = await getMarketScheduleBySegment(instrument.segment);

  return {
    instrument,
    swapCharges: {
      enabled: account.swap_enabled,
      charge: account.swap_charge
    },
    marketSchedule
  };
};
