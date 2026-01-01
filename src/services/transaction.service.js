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
