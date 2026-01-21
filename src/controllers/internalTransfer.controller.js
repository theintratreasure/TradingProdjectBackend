import {
  createInternalTransferService,
  getUserInternalTransfersService
} from '../services/internalTransfer.service.js';

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
    return res.status(400).json({
      success: false,
      message: err.message || 'Internal transfer failed'
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
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to fetch internal transfer history'
    });
  }
}
