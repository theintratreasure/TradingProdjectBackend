import ConversionRate from "../models/ConversionRate.model.js";

const DEFAULT_RATES = {
  usdtInr: 90,
  btcUsdt: 100000,
};

function round(value, precision = 8) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

async function getOrCreateRatesDoc() {
  let rates = await ConversionRate.findOne({ key: "GLOBAL" });

  if (!rates) {
    rates = await ConversionRate.create({
      key: "GLOBAL",
      ...DEFAULT_RATES,
    });
  }

  return rates;
}

export async function getConversionRatesService() {
  const rates = await getOrCreateRatesDoc();

  return {
    usdtInr: rates.usdtInr,
    btcUsdt: rates.btcUsdt,
    updatedAt: rates.updatedAt,
  };
}

export async function upsertConversionRatesService({
  usdtInr,
  btcUsdt,
  updatedBy,
}) {
  const setPayload = {};

  if (usdtInr !== undefined) {
    if (typeof usdtInr !== "number" || Number.isNaN(usdtInr) || usdtInr <= 0) {
      throw new Error("usdtInr must be a number greater than 0");
    }
    setPayload.usdtInr = usdtInr;
  }

  if (btcUsdt !== undefined) {
    if (typeof btcUsdt !== "number" || Number.isNaN(btcUsdt) || btcUsdt <= 0) {
      throw new Error("btcUsdt must be a number greater than 0");
    }
    setPayload.btcUsdt = btcUsdt;
  }

  if (!Object.keys(setPayload).length) {
    throw new Error("At least one rate is required (usdtInr or btcUsdt)");
  }

  setPayload.updatedBy = updatedBy || null;

  const setOnInsertPayload = { key: "GLOBAL" };
  if (setPayload.usdtInr === undefined) {
    setOnInsertPayload.usdtInr = DEFAULT_RATES.usdtInr;
  }
  if (setPayload.btcUsdt === undefined) {
    setOnInsertPayload.btcUsdt = DEFAULT_RATES.btcUsdt;
  }

  const rates = await ConversionRate.findOneAndUpdate(
    { key: "GLOBAL" },
    { $set: setPayload, $setOnInsert: setOnInsertPayload },
    { upsert: true, new: true },
  );

  return {
    usdtInr: rates.usdtInr,
    btcUsdt: rates.btcUsdt,
    updatedAt: rates.updatedAt,
  };
}

function normalizeCurrency(currency) {
  const c = String(currency || "").trim().toUpperCase();
  if (c === "USD") return "USDT";
  return c;
}

export async function convertAmountService({ amount, fromCurrency, toCurrency }) {
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    throw new Error("amount must be a number greater than 0");
  }

  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const allowed = new Set(["INR", "USDT", "BTC"]);

  if (!allowed.has(from) || !allowed.has(to)) {
    throw new Error("Supported currencies: INR, USD/USDT, BTC");
  }

  if (from === to) {
    return {
      amount,
      fromCurrency,
      toCurrency,
      convertedAmount: round(amount),
      rates: await getConversionRatesService(),
    };
  }

  const rates = await getConversionRatesService();

  let amountInUsdt;
  if (from === "USDT") amountInUsdt = amount;
  if (from === "INR") amountInUsdt = amount / rates.usdtInr;
  if (from === "BTC") amountInUsdt = amount * rates.btcUsdt;

  let convertedAmount;
  if (to === "USDT") convertedAmount = amountInUsdt;
  if (to === "INR") convertedAmount = amountInUsdt * rates.usdtInr;
  if (to === "BTC") convertedAmount = amountInUsdt / rates.btcUsdt;

  return {
    amount,
    fromCurrency,
    toCurrency,
    convertedAmount: round(convertedAmount),
    intermediateUsdt: round(amountInUsdt),
    rates,
  };
}
