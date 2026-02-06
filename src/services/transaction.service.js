import mongoose from "mongoose";
import Transaction from '../models/Transaction.model.js';

/**
 * USER TRANSACTION HISTORY (WITH DATE FILTER)
 */
export async function getUserTransactionHistoryService({
  userId,
  accountId,
  page,
  limit,
  type,
  status,
  fromDate,
  toDate
}) {
  const skip = (page - 1) * limit;

  const filter = {
    user: userId
  };

  // Optional filters
  if (accountId) filter.account = accountId;
  if (type) filter.type = type;
  if (status) filter.status = status;

  // Date range filter (createdAt is indexed)
  if (fromDate || toDate) {
    filter.createdAt = {};

    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }

    if (toDate) {
      // include full day
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const transactions = await Transaction.find(
    filter,
    {
      type: 1,
      amount: 1,
      balanceAfter: 1,
      status: 1,
      account: 1,
      referenceType: 1,
      referenceId: 1,
      remark: 1,
      createdAt: 1
    }
  )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // 🚀 fastest possible read

  const total = await Transaction.countDocuments(filter);

  return {
    data: transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * ADMIN USER TRANSACTION HISTORY (WITH FILTERS + DATE + PAGINATION)
 */
export async function getAdminUserTransactionHistoryService({
  userId,
  accountId,
  page,
  limit,
  type,
  status,
  referenceType,
  referenceId,
  fromDate,
  toDate,
  sortBy,
  sortDir
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid userId");
  }

  if (accountId && !mongoose.isValidObjectId(accountId)) {
    throw new Error("Invalid accountId");
  }

  if (referenceId && !mongoose.isValidObjectId(referenceId)) {
    throw new Error("Invalid referenceId");
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    user: new mongoose.Types.ObjectId(userId)
  };

  if (accountId) filter.account = new mongoose.Types.ObjectId(accountId);
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (referenceType) filter.referenceType = referenceType;
  if (referenceId) filter.referenceId = new mongoose.Types.ObjectId(referenceId);

  if (fromDate || toDate) {
    filter.createdAt = {};

    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const allowedSort = new Set(["createdAt", "amount", "status", "type"]);
  const sortField = allowedSort.has(sortBy) ? sortBy : "createdAt";
  const sortDirection = sortDir === "asc" ? 1 : -1;

  const sort = {};
  sort[sortField] = sortDirection;

  const [transactions, total, totalAmountAgg] = await Promise.all([
    Transaction.find(
      filter,
      {
        type: 1,
        amount: 1,
        balanceAfter: 1,
        status: 1,
        account: 1,
        referenceType: 1,
        referenceId: 1,
        remark: 1,
        createdAt: 1
      }
    )
      .sort(sort)
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    Transaction.countDocuments(filter),

    Transaction.aggregate([
      { $match: filter },
      { $group: { _id: null, sum: { $sum: "$amount" } } }
    ])
  ]);

  const totalAmount = totalAmountAgg?.[0]?.sum ?? 0;

  return {
    data: transactions,
    summary: {
      totalCount: total,
      totalAmount
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit)
    }
  };
}
