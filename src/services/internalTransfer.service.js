import mongoose from "mongoose";

import Account from "../models/Account.model.js";
import AccountPlan from "../models/AccountPlan.model.js";
import Transaction from "../models/Transaction.model.js";
import Trade from "../models/Trade.model.js";

import EngineSync from "../trade-engine/EngineSync.js";

/* =====================================================
   HELPERS
===================================================== */

function isValidAmount(amount) {
  if (typeof amount !== "number") return false;
  if (!Number.isFinite(amount)) return false;
  return true;
}

function hasMaxTwoDecimals(amount) {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-9;
}

function getStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/* =====================================================
   RATE LIMIT HELPERS
===================================================== */

async function enforceCooldown({ userId, session, cooldownSeconds }) {
  const last = await Transaction.findOne(
    {
      user: userId,
      referenceType: "INTERNAL_TRANSFER",
      status: "SUCCESS",
    },
    { createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .session(session)
    .lean();

  if (!last) return;

  const diff = Math.floor(
    (Date.now() - new Date(last.createdAt).getTime()) / 1000
  );

  if (diff < cooldownSeconds) {
    throw new Error(`Please wait ${cooldownSeconds - diff}s before next transfer`);
  }
}

async function enforceDailyLimits({
  userId,
  amount,
  session,
  maxTransfersPerDay,
  maxDailyAmount,
}) {
  const start = getStartOfDay(new Date());
  const end = getEndOfDay(new Date());

  const count = await Transaction.countDocuments({
    user: userId,
    type: "INTERNAL_TRANSFER_OUT",
    referenceType: "INTERNAL_TRANSFER",
    status: "SUCCESS",
    createdAt: { $gte: start, $lte: end },
  }).session(session);

  if (count >= maxTransfersPerDay) {
    throw new Error(`Daily transfer limit reached (${maxTransfersPerDay})`);
  }

  const agg = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        type: "INTERNAL_TRANSFER_OUT",
        referenceType: "INTERNAL_TRANSFER",
        status: "SUCCESS",
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: { _id: null, total: { $sum: "$amount" } },
    },
  ]).session(session);

  const today = agg.length ? agg[0].total : 0;

  if (today + amount > maxDailyAmount) {
    throw new Error(`Daily amount limit exceeded ($${maxDailyAmount})`);
  }
}

/* =====================================================
   MAIN SERVICE
===================================================== */

export async function createInternalTransferService({
  userId,
  fromAccount,
  toAccount,
  amount,
  ipAddress,
}) {
  /* ================= BASIC VALIDATION ================= */

  if (!fromAccount || !toAccount || !amount) {
    throw new Error("All fields are required");
  }

  if (String(fromAccount) === String(toAccount)) {
    throw new Error("From and To accounts must be different");
  }

  if (!isValidAmount(amount)) {
    throw new Error("Invalid transfer amount");
  }

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  if (!hasMaxTwoDecimals(amount)) {
    throw new Error("Max 2 decimal places allowed");
  }

  const MIN = 10;
  const MAX = 50000;

  if (amount < MIN) throw new Error(`Minimum $${MIN}`);
  if (amount > MAX) throw new Error(`Maximum $${MAX}`);

  /* ================= TRANSACTION ================= */

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ================= RATE LIMIT ================= */

    await enforceCooldown({
      userId,
      session,
      cooldownSeconds: 10,
    });

    await enforceDailyLimits({
      userId,
      amount,
      session,
      maxTransfersPerDay: 10,
      maxDailyAmount: 100000,
    });

    /* ================= ACCOUNT VALIDATION ================= */

    const [fromAcc, toAcc] = await Promise.all([
      Account.findOne({
        _id: fromAccount,
        user_id: userId,
        status: "active",
      }).session(session),

      Account.findOne({
        _id: toAccount,
        user_id: userId,
        status: "active",
      }).session(session),
    ]);

    if (!fromAcc) throw new Error("From account invalid");
    if (!toAcc) throw new Error("To account invalid");

    /* ================= LIVE → LIVE ================= */

    if (fromAcc.account_type !== "live") {
      throw new Error("Only LIVE accounts allowed");
    }

    if (toAcc.account_type !== "live") {
      throw new Error("Only LIVE accounts allowed");
    }

    /* ================= OPEN TRADE BLOCK ================= */

    const openTrades = await Trade.countDocuments({
      accountId: fromAcc._id,
      status: "OPEN",
    }).session(session);

    if (openTrades > 0) {
      throw new Error(
        "Transfer blocked: Close all open trades first"
      );
    }

    /* ================= FIRST DEPOSIT ================= */

    if (toAcc.first_deposit === false) {
      const plan = await AccountPlan.findById(toAcc.account_plan_id)
        .session(session)
        .lean();

      throw new Error(
        `Complete first deposit of $${plan?.minDeposit || 0}`
      );
    }

    /* ================= BALANCE CHECK ================= */

    if (fromAcc.balance < amount) {
      throw new Error("Insufficient balance");
    }

    /* ================= UPDATE BALANCES ================= */

    const fromNew = fromAcc.balance - amount;
    const toNew = toAcc.balance + amount;

    await Promise.all([
      Account.updateOne(
        { _id: fromAcc._id },
        { $set: { balance: fromNew } },
        { session }
      ),

      Account.updateOne(
        { _id: toAcc._id },
        { $set: { balance: toNew } },
        { session }
      ),
    ]);

    /* ================= TRANSACTION HISTORY ================= */

    const refId = new mongoose.Types.ObjectId();

    await Transaction.create(
      [
        {
          user: userId,
          account: fromAcc._id,
          type: "INTERNAL_TRANSFER_OUT",
          amount,
          balanceAfter: fromNew,
          status: "SUCCESS",
          referenceType: "INTERNAL_TRANSFER",
          referenceId: refId,
          createdBy: userId,
          ipAddress,
          remark: "Internal transfer debit",
        },

        {
          user: userId,
          account: toAcc._id,
          type: "INTERNAL_TRANSFER_IN",
          amount,
          balanceAfter: toNew,
          status: "SUCCESS",
          referenceType: "INTERNAL_TRANSFER",
          referenceId: refId,
          createdBy: userId,
          ipAddress,
          remark: "Internal transfer credit",
        },
      ],
      { session, ordered: true }
    );

    /* ================= COMMIT ================= */

    await session.commitTransaction();
    session.endSession();

    /* ================= ENGINE SYNC ================= */

    await EngineSync.onInternalTransfer(
      String(fromAcc._id),
      String(toAcc._id),
      amount
    );

    return {
      success: true,
      referenceId: refId,
      fromAccount: fromAcc._id,
      toAccount: toAcc._id,
      amount,
      fromBalance: fromNew,
      toBalance: toNew,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/* =====================================================
   HISTORY
===================================================== */

export async function getUserInternalTransfersService({
  userId,
  page = 1,
  limit = 10,
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const skip = (safePage - 1) * safeLimit;

  const filter = {
    user: userId,
    referenceType: "INTERNAL_TRANSFER",
    status: "SUCCESS",
    type: {
      $in: ["INTERNAL_TRANSFER_OUT", "INTERNAL_TRANSFER_IN"],
    },
  };

  const [data, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("account", "account_number account_type status")
      .lean(),

    Transaction.countDocuments(filter),
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
