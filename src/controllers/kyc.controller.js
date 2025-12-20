import {
  submitKycService,
  getUserKycService,
  updateKycStatusService,
  getAdminKycListService
} from '../services/kyc.service.js';

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
export async function getAllKycs(req, res) {
  try {
    const result = await getAdminKycListService({
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 10),
      status: req.query.status,
      documentType: req.query.documentType
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
}


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
