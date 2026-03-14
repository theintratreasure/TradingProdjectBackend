import Instrument from "../models/Instrument.model.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const providerCache = new Map();

const now = () => Date.now();

const normalizeInstrumentCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

export const normalizeProviderCode = (value) =>
  String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "");

const buildKeys = (value) => {
  const codeKey = normalizeInstrumentCode(value);
  const providerKey = normalizeProviderCode(value);
  return { codeKey, providerKey };
};

const rememberInstrument = (instrument) => {
  if (!instrument || typeof instrument !== "object") return;

  const snapshot = {
    ...instrument,
    code: normalizeInstrumentCode(instrument.code),
    providerCode: normalizeProviderCode(
      instrument.providerCode || instrument.code,
    ),
  };

  const expiresAt = now() + CACHE_TTL_MS;
  const keys = new Set();

  if (snapshot.code) keys.add(`code:${snapshot.code}`);
  if (snapshot.providerCode) keys.add(`provider:${snapshot.providerCode}`);

  for (const key of keys) {
    providerCache.set(key, { instrument: snapshot, expiresAt });
  }
};

const getFreshCache = (key) => {
  if (!key) return null;

  const cached = providerCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= now()) {
    providerCache.delete(key);
    return null;
  }

  return cached.instrument;
};

export const invalidateInstrumentProviderCache = (...values) => {
  for (const value of values) {
    const { codeKey, providerKey } = buildKeys(value);
    if (codeKey) providerCache.delete(`code:${codeKey}`);
    if (providerKey) providerCache.delete(`provider:${providerKey}`);
  }
};

export const findInstrumentByAnySymbol = async (value) => {
  const { codeKey, providerKey } = buildKeys(value);

  const cached =
    getFreshCache(codeKey ? `code:${codeKey}` : "") ||
    getFreshCache(providerKey ? `provider:${providerKey}` : "");
  if (cached) return cached;

  const filters = [];
  if (codeKey) filters.push({ code: codeKey });
  if (providerKey) filters.push({ providerCode: providerKey });
  if (filters.length === 0) return null;

  const instrument = await Instrument.findOne({ $or: filters })
    .select("code name segment providerCode isActive isTradeable")
    .lean();

  if (!instrument) return null;

  rememberInstrument(instrument);
  return getFreshCache(codeKey ? `code:${codeKey}` : "") || instrument;
};

export const resolveInstrumentProviderCode = async (value) => {
  const instrument = await findInstrumentByAnySymbol(value);
  if (instrument?.providerCode) {
    return normalizeProviderCode(instrument.providerCode);
  }

  return normalizeProviderCode(value);
};
