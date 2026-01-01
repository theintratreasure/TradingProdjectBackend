import {
  createDepositService,
  getUserDepositsService,
  getDepositStatusService,
  adminGetAllDepositsService,
  approveDepositService,
  rejectDepositService
} from '../services/deposit.service.js';

/* USER: CREATE DEPOSIT */
export async function createDeposit(req, res) {
  try {
    const deposit = await createDepositService({
      userId: req.user.id,
      ...req.body,
      ipAddress: req.ip
    });

    return res.status(201).json({
      success: true,
      message: 'Deposit request submitted',
      data: deposit
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
}

/* USER: GET OWN DEPOSITS */
export async function getMyDeposits(req, res) {
  try {
    const data = await getUserDepositsService(req.user.id);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* USER: CHECK STATUS */
export async function getDepositStatus(req, res) {
  try {
    const data = await getDepositStatusService(req.user.id, req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }
}

/* ADMIN: GET ALL */
export async function adminGetAllDeposits(req, res) {
  try {
    const data = await adminGetAllDepositsService();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/* ADMIN: APPROVE */
export async function adminApproveDeposit(req, res) {
  try {
    const data = await approveDepositService(req.params.id, req.user.id);
    return res.json({
      success: true,
      message: 'Deposit approved',
      data
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/* ADMIN: REJECT */
export async function adminRejectDeposit(req, res) {
  try {
    const { rejectionReason } = req.body;

    const data = await rejectDepositService(
      req.params.id,
      req.user.id,
      rejectionReason
    );

    return res.json({
      success: true,
      message: 'Deposit rejected',
      data
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}
