import {
  getBonusSettingsService,
  upsertBonusSettingsService,
  adminCreditBonusService,
} from "../services/bonus.service.js";

export async function adminGetBonusSettings(req, res) {
  try {
    const data = await getBonusSettingsService();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function adminUpdateBonusSettings(req, res) {
  try {
    const { bonus_enabled, default_bonus_percent } = req.body || {};
    const data = await upsertBonusSettingsService({
      bonus_enabled,
      default_bonus_percent,
      updatedBy: req.user?._id || null,
    });
    return res.status(200).json({
      success: true,
      message: "Bonus settings updated",
      data,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function adminCreditBonus(req, res) {
  try {
    const { accountId, amount, reason } = req.body || {};
    const data = await adminCreditBonusService({
      adminId: req.user?._id || null,
      accountId,
      amount: Number(amount),
      reason,
    });
    return res.status(200).json({
      success: true,
      message: "Bonus credited",
      data,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}
