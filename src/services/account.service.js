import Account from "../models/Account.model.js";
import AccountPlan from "../models/AccountPlan.model.js";
import { generateAccountNumber } from "../utils/accountNumber.util.js";

const DEMO_DEFAULT_BALANCE = 10000;

export async function createAccount({
  userId,
  account_plan_id,
  account_type
}) {
  if (!userId) {
    throw new Error('User not authenticated');
  }

  if (!['demo', 'live'].includes(account_type)) {
    throw new Error('Invalid account type');
  }

  // 🔹 FETCH ACTIVE PLAN
  const plan = await AccountPlan.findOne({
    _id: account_plan_id,
    isActive: true
  }).lean();

  if (!plan) {
    throw new Error('Invalid or inactive account plan');
  }

  /* ================= DEMO RULE ================= */
  if (account_type === 'demo') {
    if (plan.is_demo_allowed === false) {
      throw new Error('Demo account not allowed for this plan');
    }

    const demoCount = await Account.countDocuments({
      user_id: userId,
      account_type: 'demo'
    });

    if (demoCount >= 1) {
      throw new Error('Only one DEMO account is allowed');
    }
  }

  /* ================= LIVE RULE ================= */
  if (account_type === 'live') {
    const liveCount = await Account.countDocuments({
      user_id: userId,
      account_type: 'live'
    });

    if (liveCount >= 7) {
      throw new Error('Maximum 7 LIVE accounts allowed');
    }
  }

  /* ================= LEVERAGE FROM PLAN ================= */
  const leverage =
    typeof plan.max_leverage === 'number' && plan.max_leverage > 0
      ? plan.max_leverage
      : 1;

  if (leverage <= 0) {
    throw new Error('Invalid leverage configuration in account plan');
  }

  /* ================= BALANCE ================= */
  const balance =
    account_type === 'demo'
      ? DEMO_DEFAULT_BALANCE
      : 0;

  /* ================= CREATE ACCOUNT ================= */
  const account = await Account.create({
    user_id: userId,
    account_plan_id: plan._id,

    account_number: generateAccountNumber(),
    account_type,

    // 🔹 PLAN SNAPSHOT
    plan_name: plan.name,
    leverage,
    spread_type: plan.spread_type,
    spread_pips: plan.spreadPips,
    commission_per_lot: plan.commission_per_lot,
    swap_enabled: plan.swap_enabled,

    // 🔹 FINANCIALS
    balance,
    equity: balance,
    currency: plan.currency || 'USD',

    status: 'active'
  });

  return {
    id: account._id,
    account_number: account.account_number,
    account_type: account.account_type,
    plan_name: account.plan_name,
    balance: account.balance,
    currency: account.currency,
    leverage: account.leverage
  };
}
// get user accounts
export async function getUserAccounts(userId) {
  if (!userId) {
    throw new Error('User not authenticated');
  }

  return Account.find(
    { user_id: userId },
    {
      account_number: 1,
      account_type: 1,

      // 🔹 PLAN SNAPSHOT
      plan_name: 1,
      leverage: 1,
      spread_type: 1,

      // 🔹 FINANCIALS
      balance: 1,
      equity: 1,
      currency: 1,

      status: 1,
      createdAt: 1
    }
  )
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * GET SINGLE ACCOUNT DETAIL
 * SECURE: user-bound account fetch
 */
export async function getUserAccountDetail({ userId, accountId }) {
  if (!userId || !accountId) {
    throw new Error('Invalid request');
  }

  const account = await Account.findOne(
    {
      _id: accountId,
      user_id: userId
    },
    {
      account_number: 1,
      account_type: 1,

      // 🔹 PLAN SNAPSHOT
      plan_name: 1,
      leverage: 1,
      spread_type: 1,
      spread_pips: 1,
      commission_per_lot: 1,
      swap_enabled: 1,

      // 🔹 FINANCIALS
      balance: 1,
      equity: 1,
      currency: 1,

      status: 1,
      first_deposit: 1,
      createdAt: 1
    }
  ).lean();

  if (!account) {
    const err = new Error('Account not found');
    err.statusCode = 404;
    throw err;
  }

  return account;
}

export async function resetDemoAccount({ userId, accountId }) {
  const account = await Account.findOne({
    _id: accountId,
    user_id: userId,
    account_type: "demo",
    status: "active"
  });

  if (!account) {
    const err = new Error("Demo account not found or inactive");
    err.statusCode = 400;
    throw err;
  }

  account.balance = DEMO_DEFAULT_BALANCE;
  account.equity = DEMO_DEFAULT_BALANCE;

  await account.save();
  return account;
}
