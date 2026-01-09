import redis from '../config/redis.js';
import Instrument from '../models/Instrument.model.js';

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
    code,
    name,
    segment,
    lotSize,
    minQty,
    maxQty,
    qtyPrecision,
    pricePrecision,
    tickSize,
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

  // Redis GET (single roundtrip)
  const [cachedList, cachedCount] = await redis.mget(
    listKey,
    countKey
  );

  // FULL REDIS HIT (2–4ms)
  if (cachedList && cachedCount) {
    return {
      data: JSON.parse(cachedList),
      total: Number(cachedCount)
    };
  }

  // DB queries (only on MISS)
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

  // Redis SET (parallel, non-blocking)
  await redis.multi()
    .set(listKey, JSON.stringify(data), 'EX', LIST_TTL)
    .set(countKey, total, 'EX', COUNT_TTL)
    .exec();

  return { data, total };
}

export const updateInstrumentService = async (id, payload) => {
  const existing = await Instrument.findById(id);

  if (!existing) {
    throw new Error('Instrument not found');
  }

  // 🔒 Prevent duplicate code
  if (payload.code && payload.code !== existing.code) {
    const alreadyExists = await Instrument.exists({
      code: payload.code.toUpperCase(),
      _id: { $ne: id }
    });

    if (alreadyExists) {
      throw new Error('Instrument with this code already exists');
    }
  }

  // 🧠 Safe update (only provided fields)
  const updated = await Instrument.findByIdAndUpdate(
    id,
    {
      $set: {
        ...payload,
        code: payload.code ? payload.code.toUpperCase() : existing.code
      }
    },
    { new: true, runValidators: true }
  ).lean();

  // 🔥 Redis cache invalidate (FAST)
  await redis.incr(VERSION_KEY);

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

  // 🗑️ Hard delete
  await Instrument.deleteOne({ _id: id });

  // 🔥 Invalidate all instrument caches (FAST)
  await redis.incr(VERSION_KEY);

  return instrument;
};