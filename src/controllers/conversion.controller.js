import {
  convertAmountService,
  getConversionRatesService,
  upsertConversionRatesService,
} from "../services/conversion.service.js";

export async function getConversionRates(req, res) {
  try {
    const data = await getConversionRatesService();
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function upsertConversionRates(req, res) {
  try {
    const usdtInr =
      req.body?.usdtInr !== undefined ? Number(req.body.usdtInr) : undefined;
    const btcUsdt =
      req.body?.btcUsdt !== undefined ? Number(req.body.btcUsdt) : undefined;

    const data = await upsertConversionRatesService({
      usdtInr,
      btcUsdt,
      updatedBy: req.user?._id || null,
    });

    return res.status(200).json({
      success: true,
      message: "Conversion rates updated",
      data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
}

export async function convertAmount(req, res) {
  try {
    const amount = Number(req.body?.amount);
    const fromCurrency = req.body?.fromCurrency;
    const toCurrency = req.body?.toCurrency;

    const data = await convertAmountService({
      amount,
      fromCurrency,
      toCurrency,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
}
