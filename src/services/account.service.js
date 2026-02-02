import Account from "../models/Account.model.js";
import AccountPlan from "../models/AccountPlan.model.js";
import AccountAuth from "../models/AccountAuth.model.js";
import User from "../models/User.model.js";

import EngineSync from "../trade-engine/EngineSync.js";

import { sendAccountCreatedMail } from "../utils/mail.util.js";
import { generateAccountNumber } from "../utils/accountNumber.util.js";
import { generateStrongPassword } from "../utils/accountNumber.util.js";
import { hashPassword } from "../utils/hash.util.js";

const DEMO_DEFAULT_BALANCE = 10000;

/* =====================================================
   CREATE ACCOUNT
===================================================== */
export async function createAccount({ userId, account_plan_id, account_type }) {
  if (!userId) throw new Error("User not authenticated");

  if (!["demo", "live"].includes(account_type)) {
    throw new Error("Invalid account type");
  }

  /* ================= PLAN ================= */

  const plan = await AccountPlan.findOne({
    _id: account_plan_id,
    isActive: true,
  }).lean();

  if (!plan) throw new Error("Invalid plan");

  /* ================= DEMO ================= */

  if (account_type === "demo") {
    if (plan.is_demo_allowed === false) {
      throw new Error("Demo not allowed");
    }

    const demoCount = await Account.countDocuments({
      user_id: userId,
      account_type: "demo",
    });

    if (demoCount >= 1) {
      throw new Error("Only one demo account allowed");
    }
  }

  /* ================= LIVE ================= */

  if (account_type === "live") {
    const liveCount = await Account.countDocuments({
      user_id: userId,
      account_type: "live",
    });

    if (liveCount >= 7) {
      throw new Error("Maximum 7 live accounts allowed");
    }
  }

  /* ================= CONFIG ================= */

  const leverage =
    typeof plan.max_leverage === "number" && plan.max_leverage > 0
      ? plan.max_leverage
      : 1;

  if (leverage <= 0) throw new Error("Invalid leverage");

  const balance = account_type === "demo" ? DEMO_DEFAULT_BALANCE : 0;

  const accountNumber = generateAccountNumber();

  /* ================= PASSWORD ================= */

  const tradePass = generateStrongPassword(12);
  const watchPass = generateStrongPassword(12);

  const tradeHash = await hashPassword(tradePass);
  const watchHash = await hashPassword(watchPass);

  /* ================= SNAPSHOT ================= */

  const commissionPerLot =
    typeof plan.commission_per_lot === "number"
      ? plan.commission_per_lot
      : 0;

  const swapEnabled =
    typeof plan.swap_enabled === "boolean"
      ? plan.swap_enabled
      : true;

  const swapCharge =
    typeof plan.swap_charge === "number"
      ? plan.swap_charge
      : 0;

  /* ================= CREATE ================= */

  const account = await Account.create({
    user_id: userId,
    account_plan_id: plan._id,

    account_number: accountNumber,
    account_type,

    plan_name: plan.name,

    leverage,

    // ✅ SPREAD CONTROL (FROM PLAN)
    spread_enabled:
      typeof plan.spread_enabled === "boolean"
        ? plan.spread_enabled
        : true,

    spread_pips:
      typeof plan.spreadPips === "number"
        ? plan.spreadPips
        : 0,

    commission_per_lot: commissionPerLot,

    swap_enabled: swapEnabled,
    swap_charge: swapCharge,

    balance,
    equity: balance,

    currency: plan.currency || "USD",

    status: "active",
  });

  /* ================= AUTH ================= */

  await AccountAuth.create({
    account_id: account._id,
    account_number: account.account_number,

    trade_password_hash: tradeHash,
    watch_password_hash: watchHash,

    login_attempts: 0,
    is_locked: false,

    credentials_created_at: new Date(),
  });

  /* ================= ENGINE SYNC ================= */

  await EngineSync.onAccountCreated(account._id);

  /* ================= MAIL ================= */

  const user = await User.findById(userId, { email: 1 }).lean();

  if (user?.email) {
    sendAccountCreatedMail({
      email: user.email,
      accountNumber: account.account_number,
      accountType: account.account_type,
      planName: account.plan_name,
      tradePassword: tradePass,
      watchPassword: watchPass,
    }).catch(() => {});
  }

  /* ================= RETURN ================= */

  return {
    id: account._id,

    account_number: account.account_number,
    account_type: account.account_type,
    plan_name: account.plan_name,

    balance: account.balance,
    currency: account.currency,
    leverage: account.leverage,

    spread_enabled: account.spread_enabled,

    commission_per_lot: account.commission_per_lot,

    swap_enabled: account.swap_enabled,
    swap_charge: account.swap_charge,

    trade_password: tradePass,
    watch_password: watchPass,
  };
}


/* =====================================================
   GET USER ACCOUNTS
===================================================== */
export async function getUserAccounts(userId) {
  if (!userId) throw new Error("User not authenticated");

  return Account.find(
    { user_id: userId },
    {
      account_number: 1,
      account_type: 1,
      plan_name: 1,
      leverage: 1,

      spread_enabled: 1,

      balance: 1,
      equity: 1,
      currency: 1,
      status: 1,

      createdAt: 1,
    },
  )
    .sort({ createdAt: -1 })
    .lean();
}

/* =====================================================
   GET ACCOUNT DETAIL
===================================================== */
export async function getUserAccountDetail({ userId, accountId }) {
  if (!userId || !accountId) throw new Error("Invalid request");

  const account = await Account.findOne(
    { _id: accountId, user_id: userId },
    {
      account_number: 1,
      account_type: 1,
      plan_name: 1,

      leverage: 1,

      spread_enabled: 1,

      commission_per_lot: 1,

      swap_enabled: 1,

      balance: 1,
      equity: 1,
      currency: 1,

      status: 1,
      first_deposit: 1,

      createdAt: 1,
    },
  ).lean();

  if (!account) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  return account;
}

/* =====================================================
   RESET DEMO
===================================================== */
export async function resetDemoAccount({ userId, accountId }) {
  const account = await Account.findOne({
    _id: accountId,
    user_id: userId,
    account_type: "demo",
    status: "active",
  });

  if (!account) {
    const err = new Error("Demo account not found");
    err.statusCode = 400;
    throw err;
  }

  account.balance = DEMO_DEFAULT_BALANCE;
  account.equity = DEMO_DEFAULT_BALANCE;

  await account.save();

  // ✅ ENGINE UPDATE
  await EngineSync.syncAccount(account._id);

  return account;
}

/* =====================================================
   SET LEVERAGE
===================================================== */
export async function setAccountLeverage({ userId, accountId, leverage }) {
  if (!userId || !accountId) throw new Error("Invalid request");

  const account = await Account.findOne({
    _id: accountId,
    user_id: userId,
    status: "active",
  });

  if (!account) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  const plan = await AccountPlan.findById(account.account_plan_id).lean();

  if (!plan || !plan.isActive) {
    throw new Error("Plan not active");
  }

  if (plan.max_leverage > 0 && leverage > plan.max_leverage) {
    throw new Error(`Max leverage: ${plan.max_leverage}`);
  }

  if (leverage < 1) throw new Error("Invalid leverage");

  account.leverage = leverage;

  await account.save();

  // ✅ ENGINE UPDATE
  await EngineSync.syncAccount(account._id);

  return {
    account_id: account._id,
    account_number: account.account_number,
    leverage: account.leverage,
  };
}
