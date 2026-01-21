/* CREATE DEPOSIT */
import mongoose from 'mongoose';
import Deposit from '../models/Deposit.model.js';
import Account from '../models/Account.model.js';
import AccountPlan from '../models/AccountPlan.model.js';
import DepositModel from '../models/Deposit.model.js';
import Transaction from '../models/Transaction.model.js';
import redis from '../config/redis.js';

export async function createDepositService({
  userId,
  account,
  amount,
  method,
  proof,
  ipAddress
}) {
  /* ---------------- BASIC VALIDATION ---------------- */

  if (!account || !amount || !method || !proof) {
    throw new Error('All fields are required');
  }

  // amount must be a valid pure number
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('Invalid deposit amount');
  }

  // system-wide minimum deposit
  if (amount < 50) {
    throw new Error('Minimum deposit amount is $50');
  }

  /* ---------------- ACCOUNT VALIDATION ---------------- */
  const userAccount = await Account.findOne({
    _id: account,
    user_id: userId,
    status: 'active'
  }).lean();

  if (!userAccount) {
    throw new Error('Account not found or inactive');
  }

  /* ---------------- FIRST DEPOSIT LOGIC ---------------- */

  // If first_deposit flag is FALSE → this is first deposit
  if (userAccount.first_deposit === false) {
    const plan = await AccountPlan.findById(
      userAccount.account_plan_id
    ).lean();

    if (!plan) {
      throw new Error('Account plan not found');
    }

    if (amount < plan.minDeposit) {
      throw new Error(
        `Minimum first deposit for this account is $${plan.minDeposit}`
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
    ipAddress
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
  status
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  /** BASE FILTER */
  const filter = {
    user: userId
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
    DepositModel.find(
      filter,
      {
        amount: 1,
        method: 1,
        status: 1,
        proof: 1,
        rejectionReason: 1,
        createdAt: 1,
        actionAt: 1,
        account: 1
      }
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('account', 'accountNo environment')
      .lean(),

    DepositModel.countDocuments(filter)
  ]);

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit)
    }
  };
}


/* USER STATUS CHECK */
export async function getDepositStatusService(userId, depositId) {
  const deposit = await Deposit.findOne(
    {
      _id: depositId,
      user: userId
    },
    {
      // ✅ USER SAFE FIELDS ONLY
      amount: 1,
      method: 1,
      status: 1,
      rejectionReason: 1,
      'proof.image_url': 1, // ✅ ONLY IMAGE URL (SAFE)
      createdAt: 1,
      actionAt: 1
    }
  ).lean(); // ✅ FAST

  if (!deposit) {
    throw new Error('Deposit not found');
  }

  return deposit;
}


/* ADMIN GET ALL */
export async function adminGetAllDepositsService({
  page,
  limit,
  filters
}) {
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
        select: "name email"
      })
      .populate({
        path: "account",
        select: "account_number plan_name"
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Deposit.countDocuments(query)
  ]);

  const result = { records, total };

  /* 🔴 SAVE TO REDIS (60 sec) */
  await redis.setex(cacheKey, 60, JSON.stringify(result));

  return result;
}


/* ADMIN APPROVE */
export async function approveDepositService(depositId, adminId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch pending deposit
    const deposit = await Deposit.findOne({
      _id: depositId,
      status: "PENDING"
    }).session(session);

    if (!deposit) {
      throw new Error("Deposit not found or already processed");
    }

    // 2. Fetch account
    const account = await Account.findById(deposit.account).session(session);
    if (!account) {
      throw new Error("Account not found");
    }

    // 3. LIVE account check (IMPORTANT)
    if (account.account_type !== "live") {
      throw new Error("Deposit is allowed only for LIVE accounts");
    }

    // 4. Calculate new balance
    const newBalance = account.balance + deposit.amount;

    // 5. Update deposit status
    deposit.status = "APPROVED";
    deposit.actionBy = adminId;
    deposit.actionAt = new Date();
    deposit.rejectionReason = "";
    await deposit.save({ session });

    // 6. Update account balance + first deposit flag
    await Account.updateOne(
      { _id: account._id },
      {
        $set: {
          balance: newBalance,
          first_deposit: true
        }
      },
      { session }
    );

    // 7. Create transaction ledger entry
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
          remark: "Deposit approved"
        }
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      depositId: deposit._id,
      balance: newBalance
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}


/* ADMIN REJECT */
export async function rejectDepositService(depositId, adminId, reason) {
  if (!reason) throw new Error('Rejection reason required');

  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw new Error('Deposit not found');

  if (deposit.status !== 'PENDING') {
    throw new Error('Action already processed by admin');
  }

  deposit.status = 'REJECTED';
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
  adminId
}) {
  if (!depositId) {
    throw new Error('Deposit ID is required');
  }

  if (!newAmount || newAmount <= 0) {
    throw new Error('Invalid deposit amount');
  }

  // 1️⃣ Find pending deposit
  const deposit = await Deposit.findOne({
    _id: depositId,
    status: 'PENDING'
  });

  if (!deposit) {
    const err = new Error(
      'Deposit not found or already processed'
    );
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
    status: deposit.status
  };
}