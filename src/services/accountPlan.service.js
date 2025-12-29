import AccountPlan from '../models/AccountPlan.model.js';

/**
 * In-memory cache (VERY FAST)
 * Auto-invalidated on create / update / delete
 */
let activePlansCache = null;
let cacheTime = 0;

const CACHE_TTL = 5000; // 5 seconds

/* ================= CREATE ================= */

export async function createPlan(data) {
  const plan = await AccountPlan.create(data);

  // reset cache
  activePlansCache = null;
  cacheTime = 0;

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

  // reset cache
  activePlansCache = null;
  cacheTime = 0;

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

  // reset cache
  activePlansCache = null;
  cacheTime = 0;
}

/* ================= ADMIN ================= */

export async function getAllPlansAdmin() {
  return AccountPlan.find().sort({ createdAt: -1 }).lean();
}

/* ================= USER ================= */

export async function getActivePlans() {
  const now = Date.now();

  // return cache if valid
  if (activePlansCache && now - cacheTime < CACHE_TTL) {
    return activePlansCache;
  }

  const plans = await AccountPlan.find({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  // update cache
  activePlansCache = plans;
  cacheTime = now;

  return plans;
}
