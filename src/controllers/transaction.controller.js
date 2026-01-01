import { getUserTransactionHistoryService } from '../services/transaction.service.js';

/**
 * GET USER TRANSACTION HISTORY
 */
export async function getUserTransactionHistory(req, res) {
  try {
    const userId = req.user._id;

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const accountId = req.query.accountId || null;
    const type = req.query.type || null;
    const status = req.query.status || null;

    // Date filters (YYYY-MM-DD)
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    const result = await getUserTransactionHistoryService({
      userId,
      accountId,
      page,
      limit,
      type,
      status,
      fromDate,
      toDate
    });

    return res.json({
      success: true,
      message: 'Transaction history fetched successfully',
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
