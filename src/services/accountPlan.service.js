import AccountPlan from '../models/AccountPlan.model.js';
import redis from '../config/redis.js';

/**
 * Redis cache config
 */
const CACHE_KEY = 'account_plans_active';
const CACHE_TTL = 60; // ⬅️ testing ke liye 60 sec (5 sec bahut kam hai)

/* ================= CREATE ================= */

export async function createPlan(data) {
  const plan = await AccountPlan.create(data);

  // invalidate redis cache
  await redis.del(CACHE_KEY);

  return plan;
}

/* ================= UPDATE ================= */

export async function updatePlan(id, data) {
  const plan = await AccountPlan.findByIdAndUpdate(
    id,
    data,
    { new: true }
  ).lean();

  if (!plan) {
    const err = new Error('Account plan not found');
    err.statusCode = 404;
    throw err;
  }

  // invalidate redis cache
  await redis.del(CACHE_KEY);

  return plan;
}

/* ================= DELETE ================= */

export async function deletePlan(id) {
  const plan = await AccountPlan.findByIdAndDelete(id);

  if (!plan) {
    const err = new Error('Account plan not found');
    err.statusCode = 404;
    throw err;
  }

  // invalidate redis cache
  await redis.del(CACHE_KEY);
}

/* ================= ADMIN ================= */

export async function getAllPlansAdmin() {
  return AccountPlan.find().sort({ createdAt: -1 }).lean();
}

/* ================= USER ================= */

export async function getActivePlans() {
  const start = process.hrtime.bigint();

  // 1️⃣ Redis GET
  const cached = await redis.get(CACHE_KEY);

  if (cached) {
    const end = process.hrtime.bigint();
    console.log(
      'REDIS HIT |',
      Number(end - start) / 1_000_000,
      'ms'
    );

    return JSON.parse(cached);
  }

  console.log('REDIS MISS');

  // 2️⃣ MongoDB query
  const plans = await AccountPlan.find({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  // 3️⃣ Redis SET
  await redis.set(
    CACHE_KEY,
    JSON.stringify(plans),
    'EX',
    CACHE_TTL
  );

  const end = process.hrtime.bigint();
  console.log(
    'DB + REDIS SET |',
    Number(end - start) / 1_000_000,
    'ms'
  );

  return plans;
}
