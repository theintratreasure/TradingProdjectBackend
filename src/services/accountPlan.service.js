import AccountPlan from '../models/AccountPlan.model.js';

/**
 * Simple in-memory cache (VERY FAST)
 * Reset on create/update/delete
 */
let activePlansCache = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

export async function createPlan(data) {
  const plan = await AccountPlan.create(data);
  activePlansCache = null;
  return plan;
}

export async function updatePlan(id, data) {
  const plan = await AccountPlan.findByIdAndUpdate(
    id,
    data,
    { new: true }
  ).lean();

  activePlansCache = null;
  return plan;
}

export async function deletePlan(id) {
  await AccountPlan.findByIdAndDelete(id);
  activePlansCache = null;
}

export async function getAllPlansAdmin() {
  return AccountPlan.find().lean();
}

export async function getActivePlans() {
  const now = Date.now();

  if (activePlansCache && now - cacheTime < CACHE_TTL) {
    return activePlansCache;
  }

  const plans = await AccountPlan.find({ isActive: true }).lean();

  activePlansCache = plans;
  cacheTime = now;

  return plans;
}
