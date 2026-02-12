import {
  createInternalTransferService,
  adminCreateInternalTransferService,
  getUserInternalTransfersService
} from '../services/internalTransfer.service.js';

function getSafeError(err, fallbackMessage) {
  if (err && typeof err === 'object' && err.isPublic) {
    const statusCode =
      Number.isFinite(Number(err.statusCode)) && Number(err.statusCode) >= 400
        ? Number(err.statusCode)
        : 400;

    return {
      statusCode,
      message: err.message || fallbackMessage
    };
  }

  console.error('[INTERNAL_TRANSFER] error:', err);

  return {
    statusCode: 500,
    message: fallbackMessage
  };
}

export async function createInternalTransferController(req, res) {
  try {
    const userId = req.user._id;

    const { fromAccount, toAccount, amount } = req.body;

    const result = await createInternalTransferService({
      userId,
      fromAccount,
      toAccount,
      amount: Number(amount),
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: 'Internal transfer completed successfully',
      data: result
    });
  } catch (err) {
    const safe = getSafeError(err, 'Internal transfer failed');
    return res.status(safe.statusCode).json({
      success: false,
      message: safe.message
    });
  }
}

export async function adminCreateInternalTransferController(req, res) {
  try {
    const adminId = req.user._id;

    const { fromAccount, toAccount, amount } = req.body;

    const result = await adminCreateInternalTransferService({
      adminId,
      fromAccount,
      toAccount,
      amount: Number(amount),
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: 'Admin internal transfer completed successfully',
      data: result
    });
  } catch (err) {
    const safe = getSafeError(err, 'Admin internal transfer failed');
    return res.status(safe.statusCode).json({
      success: false,
      message: safe.message
    });
  }
}

export async function getUserInternalTransfersController(req, res) {
  try {
    const userId = req.user._id;

    const { page, limit } = req.query;

    const result = await getUserInternalTransfersService({
      userId,
      page: Number(page),
      limit: Number(limit)
    });

    return res.status(200).json({
      success: true,
      message: 'Internal transfer history fetched successfully',
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    const safe = getSafeError(err, 'Failed to fetch internal transfer history');
    return res.status(safe.statusCode).json({
      success: false,
      message: safe.message
    });
  }
}
