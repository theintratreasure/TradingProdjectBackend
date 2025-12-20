import KycModel from '../models/Kyc.model.js';
import UserModel from '../models/User.model.js';

/* ===============================
   SUBMIT KYC
================================ */
export async function submitKycService(userId, payload) {
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  if (user.kycStatus === 'PENDING') {
    throw new Error('KYC already under review');
  }

  if (
    !['NIC', 'PASSPORT', 'DRIVING_LICENSE', 'ELECTRICITY_BILL']
      .includes(payload.documentType)
  ) {
    throw new Error('Invalid document type');
  }

  if (!payload.documents?.front || !payload.documents?.selfie) {
    throw new Error('Front image and selfie are mandatory');
  }

  // delete old KYC (for resubmission)
  await KycModel.findOneAndDelete({ user: userId });

  const kyc = await KycModel.create({
    user: userId,
    documentType: payload.documentType,
    documents: payload.documents,
    status: 'PENDING'
  });

  await UserModel.findByIdAndUpdate(userId, {
    kycStatus: 'PENDING'
  });

  return kyc;
}

/* ===============================
   GET USER KYC
================================ */
export async function getUserKycService(userId) {
  const kyc = await KycModel.findOne({ user: userId });

  if (!kyc) {
    return { status: 'NOT_STARTED' };
  }

  return kyc;
}

/* ===============================
   ADMIN – GET ALL KYCS
================================ */
export async function getAdminKycListService({
  page = 1,
  limit = 20,
  status,
  documentType
}) {
  const filter = {};

  if (status) filter.status = status;
  if (documentType) filter.documentType = documentType;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    KycModel.find(filter)
      .populate('user', 'name email phone kycStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    KycModel.countDocuments(filter)
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}


/* ===============================
   ADMIN – UPDATE STATUS
================================ */
export async function updateKycStatusService(
  kycId,
  status,
  rejectionReason = ''
) {
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    throw new Error('Invalid KYC status');
  }

  const kyc = await KycModel.findById(kycId);
  if (!kyc) throw new Error('KYC not found');

  kyc.status = status;
  kyc.rejectionReason = status === 'REJECTED' ? rejectionReason : '';
  await kyc.save();

  await UserModel.findByIdAndUpdate(kyc.user, {
    kycStatus: status
  });

  return kyc;
}
