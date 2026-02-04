import mongoose from "mongoose";
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

/* =====================================================
   ADMIN: LIST USER ACCOUNTS (FILTER + PAGINATION)
===================================================== */
export async function adminListUserAccounts({ userId, query = {} }) {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid userId");
  }

  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
  const skip = (page - 1) * limit;

  const filter = { user_id: new mongoose.Types.ObjectId(userId) };

  if (typeof query.account_type === "string" && query.account_type.trim()) {
    filter.account_type = query.account_type.trim().toLowerCase();
  }

  if (typeof query.status === "string" && query.status.trim()) {
    filter.status = query.status.trim().toLowerCase();
  }

  const [items, total] = await Promise.all([
    Account.find(filter)
      .select(
        "_id user_id account_plan_id account_number account_type plan_name leverage spread_enabled spread_pips commission_per_lot swap_enabled swap_charge balance hold_balance equity currency first_deposit status createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Account.countDocuments(filter)
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/* =====================================================
   ADMIN: SEARCH ACCOUNTS (USER NAME / EMAIL / PHONE / ACCOUNT NUMBER)
===================================================== */
export async function adminSearchAccounts({ query = {} }) {
  const q = String(query.q || "").trim();

  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
  const skip = (page - 1) * limit;

  const accountFilter = {};
  if (typeof query.account_type === "string" && query.account_type.trim()) {
    accountFilter.account_type = query.account_type.trim().toLowerCase();
  }
  if (typeof query.status === "string" && query.status.trim()) {
    accountFilter.status = query.status.trim().toLowerCase();
  }

  const pipeline = [
    { $match: accountFilter },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ...(q
      ? [
          {
            $match: {
              $or: [
                { account_number: { $regex: new RegExp(q, "i") } },
                { "user.name": { $regex: new RegExp(q, "i") } },
                { "user.email": { $regex: new RegExp(q, "i") } },
                { "user.phone": { $regex: new RegExp(q, "i") } },
              ],
            },
          },
        ]
      : []),
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              user_id: 1,
              account_plan_id: 1,
              account_number: 1,
              account_type: 1,
              plan_name: 1,
              leverage: 1,
              spread_enabled: 1,
              spread_pips: 1,
              commission_per_lot: 1,
              swap_enabled: 1,
              swap_charge: 1,
              balance: 1,
              hold_balance: 1,
              equity: 1,
              currency: 1,
              first_deposit: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              user: {
                _id: "$user._id",
                name: "$user.name",
                email: "$user.email",
                phone: "$user.phone",
                userType: "$user.userType",
                isMailVerified: "$user.isMailVerified",
                kycStatus: "$user.kycStatus",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];

  const result = await Account.aggregate(pipeline).allowDiskUse(true);
  const items = result?.[0]?.items || [];
  const total = result?.[0]?.total?.[0]?.count || 0;

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/* =====================================================
   ADMIN: UPDATE ACCOUNT (FULL DETAILS)
===================================================== */
export async function adminUpdateAccountService({ accountId, payload = {} }) {
  if (!accountId || !mongoose.isValidObjectId(accountId)) {
    throw new Error("Invalid accountId");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Request body is required");
  }

  const account = await Account.findById(accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  const plan = await AccountPlan.findById(account.account_plan_id).lean();

  const allowedFields = [
    "leverage",
    "spread_enabled",
    "spread_pips",
    "commission_per_lot",
    "swap_enabled",
    "swap_charge",
    "status",
  ];

  const updates = {};
  for (const key of allowedFields) {
    if (payload[key] !== undefined) {
      updates[key] = payload[key];
    }
  }

  if (updates.leverage !== undefined) {
    if (typeof updates.leverage !== "number" || updates.leverage < 1) {
      throw new Error("Invalid leverage");
    }

    if (plan && typeof plan.max_leverage === "number" && plan.max_leverage > 0) {
      if (updates.leverage > plan.max_leverage) {
        throw new Error(`Max leverage: ${plan.max_leverage}`);
      }
    }
  }

  if (updates.spread_pips !== undefined) {
    if (typeof updates.spread_pips !== "number" || updates.spread_pips < 0) {
      throw new Error("Invalid spread_pips");
    }
  }

  if (updates.commission_per_lot !== undefined) {
    if (
      typeof updates.commission_per_lot !== "number" ||
      updates.commission_per_lot < 0
    ) {
      throw new Error("Invalid commission_per_lot");
    }
  }

  if (updates.swap_charge !== undefined) {
    if (typeof updates.swap_charge !== "number" || updates.swap_charge < 0) {
      throw new Error("Invalid swap_charge");
    }
  }

  if (updates.status !== undefined) {
    const status = String(updates.status).toLowerCase();
    if (!["active", "disabled"].includes(status)) {
      throw new Error("Invalid status");
    }
    updates.status = status;
  }

  if (updates.spread_enabled !== undefined) {
    updates.spread_enabled = Boolean(updates.spread_enabled);
  }

  if (updates.swap_enabled !== undefined) {
    updates.swap_enabled = Boolean(updates.swap_enabled);
  }


  Object.assign(account, updates);
  await account.save();

  await EngineSync.syncAccount(account._id);

  return account.toObject();
}

