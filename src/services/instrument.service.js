import redis from '../config/redis.js';
import Instrument from '../models/Instrument.model.js';
import EngineSync from '../trade-engine/EngineSync.js';
import { publishSymbolRemove, publishSymbolUpsert } from '../trade-engine/EngineSyncBus.js';

const LIST_TTL = 300;
const COUNT_TTL = 300;

const VERSION_KEY = 'instruments:version';
const LIST_KEY = 'instruments:list';
const COUNT_KEY = 'instruments:count';


export const createInstrumentService = async (payload) => {
  const {
    code,
    name,
    segment,
    lotSize,
    minQty,
    maxQty,
    qtyPrecision,
    pricePrecision,
    tickSize,
    spread,
    contractSize,
    swapEnabled,
    swapLong,
    swapShort,
    isActive,
    isTradeable
  } = payload;

  /* =========================
     REQUIRED VALIDATION
  ========================== */
  if (!code || !name || !segment) {
    throw new Error('code, name and segment are required');
  }

  if (minQty > maxQty) {
    throw new Error('minQty cannot be greater than maxQty');
  }

  if (lotSize <= 0) {
    throw new Error('lotSize must be greater than zero');
  }

  if (spread < 0) {
    throw new Error('spread cannot be negative');
  }

  /* =========================
     DUPLICATE CHECK (FAST)
  ========================== */
  const alreadyExists = await Instrument.exists({
    code: code.toUpperCase()
  });

  if (alreadyExists) {
    throw new Error('Instrument with this code already exists');
  }

  /* =========================
     CREATE INSTRUMENT
  ========================== */
  const instrument = await Instrument.create({
    code: code.toUpperCase(),
    name,
    segment: segment.toUpperCase(),
    lotSize,
    minQty,
    maxQty,
    qtyPrecision,
    pricePrecision,
    tickSize,
    spread,
    contractSize,
    swapEnabled,
    swapLong,
    swapShort,
    isActive,
    isTradeable
  });

  const keys = await redis.keys('instruments:*');
  if (keys.length) await redis.del(keys);

  await redis.incr(VERSION_KEY);

  // Sync symbol into trade engine (RAM)
  EngineSync.loadSymbolFromInstrument(instrument);
  publishSymbolUpsert(instrument);

  return instrument;
};


export async function getAllInstrumentService(page, limit, segment) {
  const skip = (page - 1) * limit;

  const seg = (segment || 'ALL').toUpperCase();
  const isAll = seg === 'ALL';

  const filter = isAll ? {} : { segment: seg };

  // Get cache version
  const version = (await redis.get(VERSION_KEY)) || 1;

  // Versioned keys
  const listKey = `${LIST_KEY}:v${version}:${seg}:p=${page}:l=${limit}`;
  const countKey = `${COUNT_KEY}:v${version}:${seg}`;

  // Redis GET
  const [cachedList, cachedCount] = await redis.mget(
    listKey,
    countKey
  );

  if (cachedList && cachedCount) {
    return {
      data: JSON.parse(cachedList),
      total: Number(cachedCount)
    };
  }

  // DB queries
  const [data, total] = await Promise.all([
    cachedList
      ? JSON.parse(cachedList)
      : Instrument.find(filter)
          .sort({ code: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),

    cachedCount
      ? Number(cachedCount)
      : isAll
        ? Instrument.estimatedDocumentCount()
        : Instrument.countDocuments(filter)
  ]);

  // Cache set
  await redis.multi()
    .set(listKey, JSON.stringify(data), 'EX', LIST_TTL)
    .set(countKey, total, 'EX', COUNT_TTL)
    .exec();

  return { data, total };
}

export async function searchInstrumentService(qRaw, segmentRaw, limitRaw) {
  const q = String(qRaw || "").trim();
  const segment = String(segmentRaw || "").trim().toUpperCase();
  const limit = Math.min(Math.max(Number(limitRaw || 20), 1), 200);

  if (!q) {
    throw new Error("Search query (q) is required");
  }

  if (q.length > 50) {
    throw new Error("Search query is too long");
  }

  const filter = {
    $or: [
      { code: { $regex: q, $options: "i" } },
      { name: { $regex: q, $options: "i" } }
    ]
  };

  if (segment && segment !== "ALL") {
    filter.segment = segment;
  }

  const instruments = await Instrument.find(filter)
    .sort({ code: 1 })
    .limit(limit)
    .select("-_id")
    .lean();

  return instruments || [];
}


export const updateInstrumentService = async (id, payload) => {
  const existing = await Instrument.findById(id);

  if (!existing) {
    throw new Error('Instrument not found');
  }

  /* =========================
     DUPLICATE CODE CHECK
  ========================== */
  if (payload.code && payload.code !== existing.code) {
    const alreadyExists = await Instrument.exists({
      code: payload.code.toUpperCase(),
      _id: { $ne: id }
    });

    if (alreadyExists) {
      throw new Error('Instrument with this code already exists');
    }
  }

  /* =========================
     SPREAD VALIDATION
  ========================== */
  if (payload.spread !== undefined && payload.spread < 0) {
    throw new Error('spread cannot be negative');
  }

  /* =========================
     UPDATE
  ========================== */
  const updated = await Instrument.findByIdAndUpdate(
    id,
    {
      $set: {
        ...payload,

        code: payload.code
          ? payload.code.toUpperCase()
          : existing.code,

        segment: payload.segment
          ? payload.segment.toUpperCase()
          : existing.segment
      }
    },
    { new: true, runValidators: true }
  ).lean();

  // Cache invalidate
  await redis.incr(VERSION_KEY);

  // Sync symbol into trade engine (RAM)
  EngineSync.loadSymbolFromInstrument(updated);
  publishSymbolUpsert(updated);

  return updated;
};


export const deleteInstrumentService = async (id) => {
  if (!id || id.length !== 24) {
    throw new Error('Invalid instrument id');
  }

  const instrument = await Instrument.findById(id);

  if (!instrument) {
    throw new Error('Instrument not found');
  }

  /* =========================
     DELETE
  ========================== */
  await Instrument.deleteOne({ _id: id });

  // Cache invalidate
  await redis.incr(VERSION_KEY);

  // Remove symbol from trade engine (RAM)
  EngineSync.removeInstrumentByCode(instrument.code);
  publishSymbolRemove(instrument.code);

  return instrument;
};
