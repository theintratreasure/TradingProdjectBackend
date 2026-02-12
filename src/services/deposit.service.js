/* CREATE DEPOSIT */
import mongoose from "mongoose";
import Deposit from "../models/Deposit.model.js";
import Account from "../models/Account.model.js";
import AccountPlan from "../models/AccountPlan.model.js";
import DepositModel from "../models/Deposit.model.js";
import User from "../models/User.model.js";
import Transaction from "../models/Transaction.model.js";
import redis from "../config/redis.js";
import EngineSync from "../trade-engine/EngineSync.js";

export async function createDepositService({
  userId,
  account,
  amount,
  method,
  proof,
  ipAddress,
}) {
  /* ---------------- BASIC VALIDATION ---------------- */

  if (!account || !amount || !method || !proof) {
    throw new Error("All fields are required");
  }

  // amount must be a valid pure number
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    throw new Error("Invalid deposit amount");
  }

  // system-wide minimum deposit
  if (amount < 50) {
    throw new Error("Minimum deposit amount is $50");
  }

  /* ---------------- ACCOUNT VALIDATION ---------------- */
  const userAccount = await Account.findOne({
    _id: account,
    user_id: userId,
    status: "active",
  }).lean();

  if (!userAccount) {
    throw new Error("Account not found or inactive");
  }

  /* ---------------- FIRST DEPOSIT LOGIC ---------------- */

  // If first_deposit flag is FALSE → this is first deposit
  if (userAccount.first_deposit === false) {
    const plan = await AccountPlan.findById(userAccount.account_plan_id).lean();

    if (!plan) {
      throw new Error("Account plan not found");
    }

    if (amount < plan.minDeposit) {
      throw new Error(
        `Minimum first deposit for this account is $${plan.minDeposit}`,
      );
    }
  }

  /* ---------------- CREATE DEPOSIT ---------------- */

  const deposit = await Deposit.create({
    user: userId,
    account,
    amount,
    method,
    proof,
    ipAddress,
  });

  return deposit;
}

/**
 * GET USER DEPOSITS (PAGINATED + DATE FILTER)
 * - Optimized for large scale (150k+ users)
 * - Uses lean(), projection, indexed fields
 * - Supports date range filtering
 */
export async function getUserDepositsService({
  userId,
  page = 1,
  limit = 10,
  startDate,
  endDate,
  status,
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  /** BASE FILTER */
  const filter = {
    user: userId,
  };

  /** STATUS FILTER (PENDING / APPROVED / REJECTED) */
  if (status) {
    filter.status = status;
  }

  /** DATE FILTER */
  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  /** PARALLEL QUERIES (FAST) */
  const [data, total] = await Promise.all([
    DepositModel.find(filter, {
      amount: 1,
      method: 1,
      status: 1,
      proof: 1,
      rejectionReason: 1,
      createdAt: 1,
      actionAt: 1,
      account: 1,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("account", "account_number")
      .lean(),

    DepositModel.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/* USER STATUS CHECK */
export async function getDepositStatusService(userId, depositId) {
  const deposit = await Deposit.findOne(
    {
      _id: depositId,
      user: userId,
    },
    {
      // ✅ USER SAFE FIELDS ONLY
      amount: 1,
      method: 1,
      status: 1,
      rejectionReason: 1,
      "proof.image_url": 1, // ✅ ONLY IMAGE URL (SAFE)
      createdAt: 1,
      actionAt: 1,
    },
  ).lean(); // ✅ FAST

  if (!deposit) {
    throw new Error("Deposit not found");
  }

  return deposit;
}

/* ADMIN GET ALL */
export async function adminGetAllDepositsService({ page, limit, filters }) {
  const query = {};

  if (filters?.status) {
    query.status = filters.status;
  }

  if (filters?.fromDate || filters?.toDate) {
    query.createdAt = {};
    if (filters.fromDate) {
      query.createdAt.$gte = new Date(filters.fromDate);
    }
    if (filters.toDate) {
      query.createdAt.$lte = new Date(filters.toDate);
    }
  }

  const skip = (page - 1) * limit;

  /* 🔴 REDIS CACHE KEY */
  const cacheKey = `admin:deposits:${page}:${limit}:${JSON.stringify(filters)}`;

  /* 🔴 TRY CACHE FIRST */
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  /* 🔴 DB QUERY */
  const [records, total] = await Promise.all([
    Deposit.find(query)
      .populate({
        path: "user",
        select: "name email",
      })
      .populate({
        path: "account",
        select: "account_number plan_name",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Deposit.countDocuments(query),
  ]);

  const result = { records, total };

  /* 🔴 SAVE TO REDIS (60 sec) */
  await redis.setex(cacheKey, 60, JSON.stringify(result));

  return result;
}

/**
 * ADMIN SEARCH DEPOSITS (PAGINATED + FILTERS + USER SEARCH)
 * Supports:
 * - q: user name/email/phone, account_number, plan_name, depositId
 * - status, method, userId, accountId
 * - fromDate/toDate (createdAt)
 */
export async function adminSearchDepositsService(query = {}) {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const skip = (page - 1) * limit;

  const match = {};

  const statusRaw =
    typeof query.status === "string" ? query.status.trim().toUpperCase() : "";
  if (statusRaw) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(statusRaw)) {
      throw new Error("Invalid status. Allowed: PENDING, APPROVED, REJECTED");
    }
    match.status = statusRaw;
  }

  const methodRaw =
    typeof query.method === "string" ? query.method.trim().toUpperCase() : "";
  if (methodRaw) {
    if (!["UPI", "BANK", "CRYPTO", "MANUAL"].includes(methodRaw)) {
      throw new Error("Invalid method. Allowed: UPI, BANK, CRYPTO, MANUAL");
    }
    match.method = methodRaw;
  }

  const userIdRaw = String(query.userId ?? query.user ?? "").trim();
  if (userIdRaw) {
    if (!mongoose.isValidObjectId(userIdRaw)) {
      throw new Error("Invalid userId");
    }
    match.user = new mongoose.Types.ObjectId(userIdRaw);
  }

  const accountIdRaw = String(query.accountId ?? query.account ?? "").trim();
  if (accountIdRaw) {
    if (!mongoose.isValidObjectId(accountIdRaw)) {
      throw new Error("Invalid accountId");
    }
    match.account = new mongoose.Types.ObjectId(accountIdRaw);
  }

  const fromRaw = String(
    query.fromDate ?? query.startDate ?? query.from ?? "",
  ).trim();
  const toRaw = String(query.toDate ?? query.endDate ?? query.to ?? "").trim();

  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;

  const fromValid = from instanceof Date && !Number.isNaN(from.getTime());
  const toValid = to instanceof Date && !Number.isNaN(to.getTime());

  if (fromRaw && !fromValid) throw new Error("Invalid fromDate");
  if (toRaw && !toValid) throw new Error("Invalid toDate");

  if (fromValid || toValid) {
    match.createdAt = {};
    if (fromValid) match.createdAt.$gte = from;
    if (toValid) match.createdAt.$lte = to;
  }

  const sortDirRaw =
    typeof query.sortDir === "string" ? query.sortDir.trim().toLowerCase() : "";
  const sortDir = sortDirRaw === "asc" ? 1 : -1;

  const sortByRaw =
    typeof query.sortBy === "string" ? query.sortBy.trim() : "";
  const sortBy = ["createdAt", "updatedAt", "actionAt", "amount"].includes(
    sortByRaw,
  )
    ? sortByRaw
    : "createdAt";

  const q = String(query.q || "").trim();
  const escapeRegex = (s) =>
    String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const qMatch = [];
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");

    qMatch.push(
      { "user.email": rx },
      { "user.name": rx },
      { "user.phone": rx },
      { "account.account_number": rx },
      { "account.plan_name": rx },
    );

    if (mongoose.isValidObjectId(q)) {
      qMatch.push({ _id: new mongoose.Types.ObjectId(q) });
    }
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: User.collection.name,
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: Account.collection.name,
        localField: "account",
        foreignField: "_id",
        as: "account",
      },
    },
    { $unwind: { path: "$account", preserveNullAndEmptyArrays: true } },
    ...(qMatch.length > 0 ? [{ $match: { $or: qMatch } }] : []),
    { $sort: { [sortBy]: sortDir, _id: sortDir } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              user: {
                _id: "$user._id",
                name: "$user.name",
                email: "$user.email",
                phone: "$user.phone",
                userType: "$user.userType",
                isMailVerified: "$user.isMailVerified",
                kycStatus: "$user.kycStatus",
              },
              account: {
                _id: "$account._id",
                account_number: "$account.account_number",
                account_type: "$account.account_type",
                plan_name: "$account.plan_name",
              },
              amount: 1,
              method: 1,
              status: 1,
              rejectionReason: 1,
              proof: 1,
              actionBy: 1,
              actionAt: 1,
              ipAddress: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];

  const result = await Deposit.aggregate(pipeline).allowDiskUse(true);
  const items = result?.[0]?.items || [];
  const total = result?.[0]?.total?.[0]?.count || 0;

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/* =========================
   ADMIN APPROVE DEPOSIT
========================== */
export async function approveDepositService(depositId, adminId) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      /* =========================
         1. FETCH PENDING DEPOSIT
      ========================== */
      const deposit = await Deposit.findOne({
        _id: depositId,
        status: "PENDING",
      }).session(session);

      if (!deposit) {
        throw new Error("Deposit not found or already processed");
      }

      /* =========================
         2. FETCH ACCOUNT
      ========================== */
      const account = await Account.findById(deposit.account).session(session);

      if (!account) {
        throw new Error("Account not found");
      }

      /* =========================
         3. LIVE ACCOUNT CHECK
      ========================== */
      if (account.account_type !== "live") {
        throw new Error("Deposit is allowed only for LIVE accounts");
      }

      /* =========================
         4. CALCULATE BALANCE
      ========================== */
      const newBalance = account.balance + deposit.amount;

      /* =========================
         5. UPDATE DEPOSIT
      ========================== */
      deposit.status = "APPROVED";
      deposit.actionBy = adminId;
      deposit.actionAt = new Date();
      deposit.rejectionReason = "";

      await deposit.save({ session });

      /* =========================
         6. UPDATE ACCOUNT
      ========================== */
      await Account.updateOne(
        { _id: account._id },
        {
          $set: {
            balance: newBalance,
            first_deposit: true,
          },
        },
        { session },
      );

      /* =========================
         7. TRANSACTION LOG
      ========================== */
      await Transaction.create(
        [
          {
            user: deposit.user,
            account: deposit.account,
            type: "DEPOSIT",
            amount: deposit.amount,
            balanceAfter: newBalance,
            status: "SUCCESS",
            referenceType: "DEPOSIT",
            referenceId: deposit._id,
            createdBy: adminId,
            remark: "Deposit approved",
          },
        ],
        { session },
      );
    });

    /* =========================
       SYNC ENGINE (AFTER COMMIT)
    ========================== */
    await EngineSync.onDeposit(deposit.account, deposit.amount);

    return {
      success: true,
      depositId,
    };
  } catch (err) {
    throw err;
  } finally {
    session.endSession();
  }
}

/* ADMIN REJECT */
export async function rejectDepositService(depositId, adminId, reason) {
  if (!reason) throw new Error("Rejection reason required");

  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw new Error("Deposit not found");

  if (deposit.status !== "PENDING") {
    throw new Error("Action already processed by admin");
  }

  deposit.status = "REJECTED";
  deposit.rejectionReason = reason;
  deposit.actionBy = adminId;
  deposit.actionAt = new Date();

  await deposit.save();
  return deposit;
}

/**
 * ADMIN EDIT DEPOSIT AMOUNT
 * RULE:
 * - Only PENDING deposits can be edited
 */
export async function editDepositAmountService({
  depositId,
  newAmount,
  adminId,
}) {
  if (!depositId) {
    throw new Error("Deposit ID is required");
  }

  if (!newAmount || newAmount <= 0) {
    throw new Error("Invalid deposit amount");
  }

  // 1️⃣ Find pending deposit
  const deposit = await Deposit.findOne({
    _id: depositId,
    status: "PENDING",
  });

  if (!deposit) {
    const err = new Error("Deposit not found or already processed");
    err.statusCode = 400;
    throw err;
  }

  // 2️⃣ Update amount
  deposit.amount = newAmount;
  deposit.actionBy = adminId;
  deposit.updatedAt = new Date();

  await deposit.save();

  return {
    _id: deposit._id,
    amount: deposit.amount,
    status: deposit.status,
  };
}

/* =========================
   ADMIN CREATE DEPOSIT
========================== */
export async function adminCreateDepositService({
  accountId,
  amount,
  method,
  proof,
  adminId,
  ipAddress,
}) {
  if (!accountId || !amount || !method) {
    throw new Error("All fields are required");
  }

  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid deposit amount");
  }

  const safeProof = proof && typeof proof === "object"
    ? proof
    : { image_url: "", image_public_id: "" };

  const session = await mongoose.startSession();
  let createdDeposit = null;

  try {
    await session.withTransaction(async () => {
      const account = await Account.findOne({
        _id: accountId,
        status: "active",
      }).session(session);

      if (!account) {
        throw new Error("Account not found or inactive");
      }

      const newBalance = account.balance + amount;

      createdDeposit = await Deposit.create(
        [
          {
            user: account.user_id,
            account: account._id,
            amount,
            method,
            proof: safeProof,
            status: "APPROVED",
            actionBy: adminId,
            actionAt: new Date(),
            ipAddress,
          },
        ],
        { session },
      );

      await Account.updateOne(
        { _id: account._id },
        {
          $set: {
            balance: newBalance,
            first_deposit: true,
          },
        },
        { session },
      );

      await Transaction.create(
        [
          {
            user: account.user_id,
            account: account._id,
            type: "DEPOSIT",
            amount,
            balanceAfter: newBalance,
            status: "SUCCESS",
            referenceType: "DEPOSIT",
            referenceId: createdDeposit[0]._id,
            createdBy: adminId,
            remark: "Admin deposit",
          },
        ],
        { session },
      );
    });

    // Sync engine after DB commit
    await EngineSync.onDeposit(accountId, amount);

    return createdDeposit?.[0] || null;
  } finally {
    session.endSession();
  }
}
