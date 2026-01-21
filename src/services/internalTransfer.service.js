import mongoose from 'mongoose';
import Account from '../models/Account.model.js';
import AccountPlan from '../models/AccountPlan.model.js';
import Transaction from '../models/Transaction.model.js';

function isValidAmount(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return false;
  if (!Number.isFinite(amount)) return false;
  return true;
}

function hasMaxTwoDecimals(amount) {
  const multiplied = Math.round(amount * 100);
  return Math.abs(amount * 100 - multiplied) < 1e-9;
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

async function enforceCooldown({
  userId,
  session,
  cooldownSeconds
}) {
  const lastTransfer = await Transaction.findOne(
    {
      user: userId,
      referenceType: 'INTERNAL_TRANSFER',
      status: 'SUCCESS'
    },
    { createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .session(session)
    .lean();

  if (!lastTransfer) return;

  const now = Date.now();
  const last = new Date(lastTransfer.createdAt).getTime();
  const diffSeconds = Math.floor((now - last) / 1000);

  if (diffSeconds < cooldownSeconds) {
    throw new Error(
      `Please wait ${cooldownSeconds - diffSeconds}s before next transfer`
    );
  }
}

async function enforceDailyLimits({
  userId,
  amount,
  session,
  maxTransfersPerDay,
  maxDailyAmount
}) {
  const startOfDay = getStartOfDay(new Date());
  const endOfDay = getEndOfDay(new Date());

  // Each transfer makes 2 transactions (OUT + IN)
  // We'll count OUT only as 1 transfer
  const todayTransferCount = await Transaction.countDocuments({
    user: userId,
    type: 'INTERNAL_TRANSFER_OUT',
    referenceType: 'INTERNAL_TRANSFER',
    status: 'SUCCESS',
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  }).session(session);

  if (todayTransferCount >= maxTransfersPerDay) {
    throw new Error(
      `Daily transfer limit reached (${maxTransfersPerDay} transfers per day)`
    );
  }

  // total amount per day (sum OUT)
  const agg = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        type: 'INTERNAL_TRANSFER_OUT',
        referenceType: 'INTERNAL_TRANSFER',
        status: 'SUCCESS',
        createdAt: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]).session(session);

  const todayTotal = agg.length ? agg[0].total : 0;

  if (todayTotal + amount > maxDailyAmount) {
    throw new Error(
      `Daily transfer amount limit exceeded (Max $${maxDailyAmount})`
    );
  }
}

/**
 * CREATE INTERNAL TRANSFER (NO SEPARATE MODEL)
 *
 * HISTORY STORAGE:
 * - 2 Transaction records will be created:
 *   1) INTERNAL_TRANSFER_OUT (fromAccount)
 *   2) INTERNAL_TRANSFER_IN  (toAccount)
 *
 * RESTRICTIONS:
 * - ownership check (same user)
 * - both active
 * - LIVE -> LIVE only
 * - from != to
 * - amount validation + min/max + 2 decimals
 * - sufficient balance
 * - strict block if toAccount.first_deposit === false (cannot bypass first deposit)
 * - mongoose transaction
 * - rate limits
 * - referral must NOT trigger here
 */
export async function createInternalTransferService({
  userId,
  fromAccount,
  toAccount,
  amount,
  ipAddress
}) {
  /* ---------------- BASIC VALIDATION ---------------- */
  if (!fromAccount || !toAccount || !amount) {
    throw new Error('All fields are required');
  }

  if (String(fromAccount) === String(toAccount)) {
    throw new Error('From and To accounts must be different');
  }

  if (!isValidAmount(amount)) {
    throw new Error('Invalid transfer amount');
  }

  if (amount <= 0) {
    throw new Error('Transfer amount must be greater than 0');
  }

  if (!hasMaxTwoDecimals(amount)) {
    throw new Error('Amount can have maximum 2 decimal places');
  }

  const MIN_TRANSFER = 10;
  const MAX_TRANSFER = 50000;

  if (amount < MIN_TRANSFER) {
    throw new Error(`Minimum transfer amount is $${MIN_TRANSFER}`);
  }

  if (amount > MAX_TRANSFER) {
    throw new Error(`Maximum transfer amount is $${MAX_TRANSFER}`);
  }

  /* ---------------- TRANSACTION START ---------------- */
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ---------------- RATE LIMITS ---------------- */
    await enforceCooldown({
      userId,
      session,
      cooldownSeconds: 10
    });

    await enforceDailyLimits({
      userId,
      amount,
      session,
      maxTransfersPerDay: 10,
      maxDailyAmount: 100000
    });

    /* ---------------- ACCOUNT VALIDATION ---------------- */
    const [fromAcc, toAcc] = await Promise.all([
      Account.findOne({
        _id: fromAccount,
        user_id: userId,
        status: 'active'
      }).session(session),

      Account.findOne({
        _id: toAccount,
        user_id: userId,
        status: 'active'
      }).session(session)
    ]);

    if (!fromAcc) {
      throw new Error('From account not found or inactive');
    }
    if (!toAcc) {
      throw new Error('To account not found or inactive');
    }

    /* ---------------- LIVE -> LIVE ONLY ---------------- */
    if (fromAcc.account_type !== 'live') {
      throw new Error('Internal transfer allowed only from LIVE account');
    }
    if (toAcc.account_type !== 'live') {
      throw new Error('Internal transfer allowed only to LIVE account');
    }

    /* ---------------- FIRST DEPOSIT BYPASS BLOCK (STRICT) ---------------- */
    if (toAcc.first_deposit === false) {
      const plan = await AccountPlan.findById(toAcc.account_plan_id)
        .session(session)
        .lean();

      if (!plan) {
        throw new Error('Account plan not found');
      }

      throw new Error(
        `Transfer not allowed. Please complete first deposit of $${plan.minDeposit} on the destination account`
      );
    }

    /* ---------------- SUFFICIENT BALANCE ---------------- */
    if (typeof fromAcc.balance !== 'number') {
      throw new Error('Invalid account balance');
    }

    if (fromAcc.balance < amount) {
      throw new Error('Insufficient balance in source account');
    }

    /* ---------------- CALCULATE NEW BALANCES ---------------- */
    const fromNewBalance = fromAcc.balance - amount;
    const toNewBalance = toAcc.balance + amount;

    /* ---------------- UPDATE BALANCES ---------------- */
    await Promise.all([
      Account.updateOne(
        { _id: fromAcc._id },
        { $set: { balance: fromNewBalance } },
        { session }
      ),
      Account.updateOne(
        { _id: toAcc._id },
        { $set: { balance: toNewBalance } },
        { session }
      )
    ]);

    /* ---------------- CREATE REFERENCE ID (FOR LINKING BOTH ROWS) ---------------- */
    const transferReferenceId = new mongoose.Types.ObjectId();

    /* ---------------- DOUBLE ENTRY TRANSACTION HISTORY ---------------- */
    await Transaction.create(
  [
    {
      user: userId,
      account: fromAcc._id,
      type: 'INTERNAL_TRANSFER_OUT',
      amount: amount,
      balanceAfter: fromNewBalance,
      status: 'SUCCESS',
      referenceType: 'INTERNAL_TRANSFER',
      referenceId: transferReferenceId,
      createdBy: userId,
      remark: 'Internal transfer debit'
    },
    {
      user: userId,
      account: toAcc._id,
      type: 'INTERNAL_TRANSFER_IN',
      amount: amount,
      balanceAfter: toNewBalance,
      status: 'SUCCESS',
      referenceType: 'INTERNAL_TRANSFER',
      referenceId: transferReferenceId,
      createdBy: userId,
      remark: 'Internal transfer credit'
    }
  ],
  { session, ordered: true }
);


    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      referenceId: transferReferenceId,
      fromAccount: fromAcc._id,
      toAccount: toAcc._id,
      amount,
      fromBalance: fromNewBalance,
      toBalance: toNewBalance
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * GET USER INTERNAL TRANSFERS (PAGINATED)
 * We read from Transaction History only.
 */
export async function getUserInternalTransfersService({
  userId,
  page = 1,
  limit = 10
}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    user: userId,
    referenceType: 'INTERNAL_TRANSFER',
    status: 'SUCCESS',
    type: { $in: ['INTERNAL_TRANSFER_OUT', 'INTERNAL_TRANSFER_IN'] }
  };

  const [data, total] = await Promise.all([
    Transaction.find(
      filter,
      {
        user: 1,
        account: 1,
        type: 1,
        amount: 1,
        balanceAfter: 1,
        status: 1,
        referenceType: 1,
        referenceId: 1,
        remark: 1,
        createdAt: 1
      }
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('account', 'accountNo account_type status')
      .lean(),

    Transaction.countDocuments(filter)
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
