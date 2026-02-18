import mongoose from 'mongoose';
import PaymentMethod from '../models/PaymentMethod.model.js';
import cloudinary from '../config/cloudinary.js';
import redis from '../config/redis.js';

/* =======================
   REDIS KEYS
======================= */
const ACTIVE_CACHE_KEY = 'payment_methods:active';
const ALL_CACHE_KEY = 'payment_methods:all';
const CACHE_TTL = 60; // seconds

const clearPaymentMethodCache = async () => {
  await redis.del(ACTIVE_CACHE_KEY);
  await redis.del(ALL_CACHE_KEY);
};

/* =======================
   CREATE PAYMENT METHOD
======================= */
export async function createPaymentMethodService(userId, body) {
  const { type } = body;

  if (!type) {
    const err = new Error('Payment method type is required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const payload = {
    type,
    title: body.title,
    image_url: body.image_url || '',
    image_public_id: body.image_public_id || '',
    created_by: userId,
    is_active: true
  };

  if (type === 'BANK') {
    if (
      !body.bank_name ||
      !body.account_name ||
      !body.account_number ||
      !body.ifsc
    ) {
      const err = new Error('Bank details are required');
      err.code = 'INVALID_INPUT';
      throw err;
    }

    payload.bank_name = body.bank_name;
    payload.account_name = body.account_name;
    payload.account_number = body.account_number;
    payload.ifsc = body.ifsc;
  }

  if (type === 'UPI') {
    if (!body.upi_id) {
      const err = new Error('UPI id is required');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    payload.upi_id = body.upi_id;
  }

  if (type === 'CRYPTO') {
    if (!body.crypto_network || !body.crypto_address) {
      const err = new Error('Crypto details are required');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    payload.crypto_network = body.crypto_network;
    payload.crypto_address = body.crypto_address;
  }

  if (type === 'INTERNATIONAL') {
    if (!body.international_name || !body.international_email) {
      const err = new Error('International name and email are required');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    payload.international_name = body.international_name;
    payload.international_email = body.international_email;
  }

  const created = await PaymentMethod.create(payload);
  await clearPaymentMethodCache();

  return created;
}

/* =======================
   UPDATE PAYMENT METHOD
======================= */
export async function updatePaymentMethodService(id, body) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const existing = await PaymentMethod.findById(id).lean();
  if (!existing) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const newImagePublicId =
    typeof body.image_public_id === 'string' && body.image_public_id.length > 0
      ? body.image_public_id
      : '';

  if (
    newImagePublicId &&
    existing.image_public_id &&
    existing.image_public_id !== newImagePublicId
  ) {
    try {
      await cloudinary.uploader.destroy(existing.image_public_id);
    } catch {
      const err = new Error('Failed to delete old payment image');
      err.code = 'CLOUDINARY_DELETE_FAILED';
      throw err;
    }
  }

  const updated = await PaymentMethod.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true }
  ).lean();

  await clearPaymentMethodCache();
  return updated;
}

/* =======================
   DELETE PAYMENT METHOD
======================= */
export async function deletePaymentMethodService(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const paymentMethod = await PaymentMethod.findById(id).lean();
  if (!paymentMethod) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (paymentMethod.image_public_id) {
    try {
      await cloudinary.uploader.destroy(paymentMethod.image_public_id);
    } catch {
      const err = new Error('Failed to delete payment image');
      err.code = 'CLOUDINARY_DELETE_FAILED';
      throw err;
    }
  }

  await PaymentMethod.deleteOne({ _id: id });
  await clearPaymentMethodCache();

  return true;
}

/* =======================
   TOGGLE ACTIVE / INACTIVE
======================= */
export async function togglePaymentMethodService(id, isActive) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const existing = await PaymentMethod.findById(id).lean();
  if (!existing) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const activate = Boolean(isActive);

  if (activate && (existing.type === 'BANK' || existing.type === 'UPI')) {
    await PaymentMethod.updateMany(
      { _id: { $ne: existing._id }, type: existing.type, is_active: true },
      { $set: { is_active: false } }
    );
  }

  const updated = await PaymentMethod.findByIdAndUpdate(
    id,
    { $set: { is_active: activate } },
    { new: true }
  ).lean();

  await clearPaymentMethodCache();
  return updated;
}

/* =======================
   USER → ONLY ACTIVE
======================= */
export async function getActivePaymentMethodsService() {
  try {
    const cached = await redis.get(ACTIVE_CACHE_KEY);
    if (cached) {
      return cached;
    }
  } catch {
    // redis unavailable, fallback to DB
  }

  const data = await PaymentMethod.find({ is_active: true })
    .sort({ createdAt: -1 })
    .lean();

  const payload = JSON.stringify(data);

  try {
    await redis.setex(ACTIVE_CACHE_KEY, CACHE_TTL, payload);
  } catch {
    // ignore redis failure
  }

  return payload;
}
/* =======================
   ADMIN → ALL
======================= */
export async function getAllPaymentMethodsService() {
  const cached = await redis.get(ALL_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const data = await PaymentMethod.find({})
    .sort({ createdAt: -1 })
    .lean();

  await redis.setex(ALL_CACHE_KEY, CACHE_TTL, JSON.stringify(data));
  return data;
}
