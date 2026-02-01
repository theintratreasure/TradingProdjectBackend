import Account from "../models/Account.model.js";
import AccountPlan from "../models/AccountPlan.model.js";
import AccountAuth from "../models/AccountAuth.model.js";
import User from "../models/User.model.js";
import { sendAccountCreatedMail } from "../utils/mail.util.js";
import { generateAccountNumber } from "../utils/accountNumber.util.js";
import { generateStrongPassword } from "../utils/accountNumber.util.js";
import { hashPassword } from "../utils/hash.util.js";

const DEMO_DEFAULT_BALANCE = 10000;

/**
 * =====================================================
 * CREATE ACCOUNT (ACCOUNT + ACCOUNT AUTH)
 * =====================================================
 */
export async function createAccount({
  userId,
  account_plan_id,
  account_type,
}) {
  if (!userId) {
    throw new Error("User not authenticated");
  }

  if (account_type !== "demo" && account_type !== "live") {
    throw new Error("Invalid account type");
  }

  // ================= PLAN =================
  const plan = await AccountPlan.findOne({
    _id: account_plan_id,
    isActive: true,
  }).lean();

  if (!plan) {
    throw new Error("Invalid or inactive account plan");
  }

  // ================= DEMO RULE =================
  if (account_type === "demo") {
    if (plan.is_demo_allowed === false) {
      throw new Error("Demo account not allowed for this plan");
    }

    const demoCount = await Account.countDocuments({
      user_id: userId,
      account_type: "demo",
    });

    if (demoCount >= 1) {
      throw new Error("Only one DEMO account is allowed");
    }
  }

  // ================= LIVE RULE =================
  if (account_type === "live") {
    const liveCount = await Account.countDocuments({
      user_id: userId,
      account_type: "live",
    });

    if (liveCount >= 7) {
      throw new Error("Maximum 7 LIVE accounts allowed");
    }
  }

  // ================= LEVERAGE =================
  const leverage =
    typeof plan.max_leverage === "number" && plan.max_leverage > 0
      ? plan.max_leverage
      : 1;

  if (leverage <= 0) {
    throw new Error("Invalid leverage configuration");
  }

  // ================= BALANCE =================
  const balance = account_type === "demo" ? DEMO_DEFAULT_BALANCE : 0;

  // ================= ACCOUNT NUMBER =================
  const accountNumber = generateAccountNumber();

  // ================= PASSWORD =================
  const tradePasswordPlain = generateStrongPassword(12);
  const watchPasswordPlain = generateStrongPassword(12);

  const tradePasswordHash = await hashPassword(tradePasswordPlain);
  const watchPasswordHash = await hashPassword(watchPasswordPlain);

  // ================= PLAN SNAPSHOT =================
  const spreadType = plan.spread_type || "FLOATING";
  const spreadPips = typeof plan.spreadPips === "number" ? plan.spreadPips : 0;
  const commissionPerLot =
    typeof plan.commission_per_lot === "number"
      ? plan.commission_per_lot
      : 0;

  const swapEnabled = !!plan.swap_enabled;

  const swapCharge =
    typeof plan.swap_charge === "number" ? plan.swap_charge : 0;

  // ================= CREATE ACCOUNT =================
  const account = await Account.create({
    user_id: userId,
    account_plan_id: plan._id,

    account_number: accountNumber,
    account_type,

    // ===== PLAN SNAPSHOT =====
    plan_name: plan.name,
    leverage,

    spread_type: spreadType,
    spread_pips: spreadPips,

    commission_per_lot: commissionPerLot,

    swap_enabled: swapEnabled,
    swap_charge: swapCharge,

    // ===== FINANCIALS =====
    balance,
    equity: balance,

    currency: plan.currency || "USD",

    status: "active",
  });

  // ================= CREATE ACCOUNT AUTH =================
  await AccountAuth.create({
    account_id: account._id,
    account_number: account.account_number,

    trade_password_hash: tradePasswordHash,
    watch_password_hash: watchPasswordHash,

    login_attempts: 0,
    is_locked: false,

    credentials_created_at: new Date(),
  });

  // ================= SEND ACCOUNT EMAIL =================
  const user = await User.findById(userId, { email: 1 }).lean();

  if (user?.email) {
    sendAccountCreatedMail({
      email: user.email,
      accountNumber: account.account_number,
      accountType: account.account_type,
      planName: account.plan_name,
      tradePassword: tradePasswordPlain,
      watchPassword: watchPasswordPlain,
    }).catch(() => {});
  }

  // ================= RETURN =================
  return {
    id: account._id,
    account_number: account.account_number,
    account_type: account.account_type,
    plan_name: account.plan_name,

    balance: account.balance,
    currency: account.currency,
    leverage: account.leverage,

    spread_type: account.spread_type,
    spread_pips: account.spread_pips,
    commission_per_lot: account.commission_per_lot,

    swap_enabled: account.swap_enabled,
    swap_charge: account.swap_charge,

    // ⚠️ Only once
    trade_password: tradePasswordPlain,
    watch_password: watchPasswordPlain,
  };
}

/**
 * =====================================================
 * GET USER ACCOUNTS
 * =====================================================
 */
export async function getUserAccounts(userId) {
  if (!userId) {
    throw new Error("User not authenticated");
  }

  return Account.find(
    { user_id: userId },
    {
      account_number: 1,
      account_type: 1,
      plan_name: 1,
      leverage: 1,
      spread_type: 1,
      balance: 1,
      equity: 1,
      currency: 1,
      status: 1,
      createdAt: 1,
    }
  )
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * =====================================================
 * GET SINGLE ACCOUNT (USER SAFE)
 * =====================================================
 */
export async function getUserAccountDetail({ userId, accountId }) {
  if (!userId || !accountId) {
    throw new Error("Invalid request");
  }

  const account = await Account.findOne(
    { _id: accountId, user_id: userId },
    {
      account_number: 1,
      account_type: 1,
      plan_name: 1,
      leverage: 1,
      spread_type: 1,
      spread_pips: 1,
      commission_per_lot: 1,
      swap_enabled: 1,
      balance: 1,
      equity: 1,
      currency: 1,
      status: 1,
      first_deposit: 1,
      createdAt: 1,
    }
  ).lean();

  if (!account) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  return account;
}

/**
 * =====================================================
 * RESET DEMO ACCOUNT
 * =====================================================
 */
export async function resetDemoAccount({ userId, accountId }) {
  const account = await Account.findOne({
    _id: accountId,
    user_id: userId,
    account_type: "demo",
    status: "active",
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
/**
 * =====================================================
 * Account leverage setting user service
 * =====================================================
 */
export async function setAccountLeverage({ userId, accountId, leverage }) {
  if (!userId || !accountId) {
    throw new Error("Invalid request");
  }

  const account = await Account.findOne({
    _id: accountId,
    user_id: userId,
    status: "active"
  });

  if (!account) {
    const err = new Error("Account not found");
    err.statusCode = 404;
    throw err;
  }

  const plan = await AccountPlan.findById(account.account_plan_id).lean();

  if (!plan || !plan.isActive) {
    throw new Error("Account plan not active");
  }

  // PLAN MAX LEVERAGE CHECK
  // max_leverage = 0 means unlimited
  if (plan.max_leverage > 0 && leverage > plan.max_leverage) {
    throw new Error(
      `Maximum allowed leverage for this plan is ${plan.max_leverage}`
    );
  }

  if (leverage < 1) {
    throw new Error("Leverage must be at least 1");
  }

  account.leverage = leverage;
  await account.save();

  return {
    account_id: account._id,
    account_number: account.account_number,
    leverage: account.leverage
  };
}
