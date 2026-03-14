import Instrument from "../models/Instrument.model.js";
import Account from "../models/Account.model.js";
import { MarketSchedule } from "../models/MarketSchedule.model.js";
import { findInstrumentByAnySymbol } from "./instrumentProvider.service.js";

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
  const symbol = String(symbolRaw || "").trim();

  if (!symbol) {
    throw new Error("symbol is required");
  }

  if (!accountId) {
    throw new Error("accountId is required");
  }

  const [instrumentMatch, account] = await Promise.all([
    findInstrumentByAnySymbol(symbol),
    Account.findById(accountId).select("swap_enabled swap_charge").lean()
  ]);

  const instrument = instrumentMatch
    ? await Instrument.findOne({ code: instrumentMatch.code }).select("-_id").lean()
    : null;

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
