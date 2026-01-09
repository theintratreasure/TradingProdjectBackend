import Instrument from '../models/Instrument.model.js';

export const createInstrumentService = async (payload) => {
  const {
    code,
    name,
    segment,
    lotSize,
    minQty,
    maxQty,
    qtyPrecision,
    pricePrecision,
    tickSize,
    contractSize,
    swapEnabled,
    swapLong,
    swapShort,
    isActive,
    isTradeable
  } = payload;

  /* =========================
     REQUIRED VALIDATION
  ========================== */
  if (!code || !name || !segment) {
    throw new Error('code, name and segment are required');
  }

  if (minQty > maxQty) {
    throw new Error('minQty cannot be greater than maxQty');
  }

  if (lotSize <= 0) {
    throw new Error('lotSize must be greater than zero');
  }

  /* =========================
     DUPLICATE CHECK (FAST)
  ========================== */
  const alreadyExists = await Instrument.exists({
    code: code.toUpperCase()
  });

  if (alreadyExists) {
    throw new Error('Instrument with this code already exists');
  }

  /* =========================
     CREATE INSTRUMENT
  ========================== */
  const instrument = await Instrument.create({
    code,
    name,
    segment,
    lotSize,
    minQty,
    maxQty,
    qtyPrecision,
    pricePrecision,
    tickSize,
    contractSize,
    swapEnabled,
    swapLong,
    swapShort,
    isActive,
    isTradeable
  });

  return instrument;
};
