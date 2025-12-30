import {
  submitKycService,
  getUserKycService,
  updateKycStatusService,
  getAdminKycListService
} from '../services/kyc.service.js';
import Kyc from "../models/Kyc.model.js";
/* USER */
export async function submitKyc(req, res) {
  try {
    const kyc = await submitKycService(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: 'KYC submitted successfully',
      data: kyc
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}

export async function getMyKyc(req, res) {
  try {
    const data = await getUserKycService(req.user._id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/* ADMIN */
export const getAllKycs = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [list, total] = await Promise.all([
      Kyc.find(query)
        .populate("user", "name email phone")
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),

      Kyc.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        list,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export async function updateKycStatus(req, res) {
  try {
    const { status, rejectionReason } = req.body;

    const kyc = await updateKycStatusService(
      req.params.kycId,
      status,
      rejectionReason
    );

    res.json({
      success: true,
      message: `KYC ${status.toLowerCase()} successfully`,
      data: kyc
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
}
