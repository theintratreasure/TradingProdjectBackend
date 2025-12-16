import Inquiry from '../models/Inquiry.model.js';

/**
 * CREATE INQUIRY
 */
export function createInquiryService(payload) {
  return Inquiry.create(payload);
}

/**
 * GET INQUIRIES (ADMIN)
 */
export async function getInquiriesService(page, limit) {
  const skip = (page - 1) * limit;

  const data = await Inquiry.find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Inquiry.countDocuments();

  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}
