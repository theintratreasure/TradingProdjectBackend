import mongoose from 'mongoose';
import PaymentMethod from '../models/PaymentMethod.model.js';

/**
 * CREATE PAYMENT METHOD
 */
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

  return PaymentMethod.create(payload);
}


/**
 * UPDATE PAYMENT METHOD
 */
export async function updatePaymentMethodService(id, body) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const updated = await PaymentMethod.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true }
  ).lean();

  if (!updated) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return updated;
}

/**
 * DELETE PAYMENT METHOD
 */
export async function deletePaymentMethodService(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const deleted = await PaymentMethod.findByIdAndDelete(id);

  if (!deleted) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return true;
}

/**
 * TOGGLE ACTIVE / INACTIVE
 */
export async function togglePaymentMethodService(id, isActive) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid payment method id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const updated = await PaymentMethod.findByIdAndUpdate(
    id,
    { $set: { is_active: Boolean(isActive) } },
    { new: true }
  ).lean();

  if (!updated) {
    const err = new Error('Payment method not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return updated;
}

/**
 * USER → ONLY ACTIVE
 */
export async function getActivePaymentMethodsService() {
  return PaymentMethod.find({ is_active: true })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * ADMIN → ALL
 */
export async function getAllPaymentMethodsService() {
  return PaymentMethod.find({})
    .sort({ createdAt: -1 })
    .lean();
}
