import mongoose from "mongoose";
import BonusSetting from "../models/BonusSetting.model.js";
import Account from "../models/Account.model.js";
import Transaction from "../models/Transaction.model.js";
import EngineSync from "../trade-engine/EngineSync.js";
import { publishAccountBalance, publishBonusSettings } from "../trade-engine/EngineSyncBus.js";

const SETTINGS_KEY = "GLOBAL";
const CACHE_TTL_MS = 30 * 1000;
const MAX_BONUS_PERCENT = 200;

let cachedSettings = null;
let cachedAt = 0;

function normalizePercent(value, fieldName = "bonus_percent") {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number`);
  }
  if (value < 0 || value > MAX_BONUS_PERCENT) {
    throw new Error(`${fieldName} must be between 0 and ${MAX_BONUS_PERCENT}`);
  }
  return Number(value);
}

async function getOrCreateSettings() {
  let settings = await BonusSetting.findOne({ key: SETTINGS_KEY });
  if (!settings) {
    settings = await BonusSetting.create({
      key: SETTINGS_KEY,
      bonus_enabled: true,
      default_bonus_percent: 0,
    });
  }
  return settings;
}

export async function getBonusSettingsCached({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedSettings && now - cachedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }
  const settings = await getOrCreateSettings();
  cachedSettings = settings.toObject ? settings.toObject() : settings;
  cachedAt = now;
  return cachedSettings;
}

export async function getBonusSettingsService() {
  const settings = await getBonusSettingsCached({ force: true });
  return {
    bonus_enabled: Boolean(settings.bonus_enabled),
    default_bonus_percent: Number(settings.default_bonus_percent || 0),
    updatedAt: settings.updatedAt,
  };
}

export async function upsertBonusSettingsService({
  bonus_enabled,
  default_bonus_percent,
  updatedBy,
}) {
  const setPayload = {};

  if (bonus_enabled !== undefined) {
    setPayload.bonus_enabled = Boolean(bonus_enabled);
  }

  if (default_bonus_percent !== undefined) {
    setPayload.default_bonus_percent = normalizePercent(
      default_bonus_percent,
      "default_bonus_percent",
    );
  }

  if (!Object.keys(setPayload).length) {
    throw new Error("At least one setting is required");
  }

  setPayload.updatedBy = updatedBy || null;

  const setOnInsert = {
    key: SETTINGS_KEY,
  };
  if (setPayload.bonus_enabled === undefined) {
    setOnInsert.bonus_enabled = true;
  }
  if (setPayload.default_bonus_percent === undefined) {
    setOnInsert.default_bonus_percent = 0;
  }

  const settings = await BonusSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: setPayload,
      $setOnInsert: setOnInsert,
    },
    { upsert: true, new: true },
  );

  cachedSettings = settings.toObject ? settings.toObject() : settings;
  cachedAt = Date.now();

  try {
    publishBonusSettings({
      bonus_enabled: Boolean(settings.bonus_enabled),
      default_bonus_percent: Number(settings.default_bonus_percent || 0),
    });
  } catch (err) {
    console.warn("[BONUS] publishBonusSettings failed:", err?.message || err);
  }

  return {
    bonus_enabled: Boolean(settings.bonus_enabled),
    default_bonus_percent: Number(settings.default_bonus_percent || 0),
    updatedAt: settings.updatedAt,
  };
}

export async function getEffectiveBonusPercentForAccount(account) {
  const settings = await getBonusSettingsCached();
  if (!settings?.bonus_enabled) return 0;

  const override =
    account && typeof account.bonus_percent_override === "number"
      ? account.bonus_percent_override
      : null;

  if (override !== null) {
    return normalizePercent(override, "bonus_percent_override");
  }

  return normalizePercent(
    Number(settings.default_bonus_percent || 0),
    "default_bonus_percent",
  );
}

export async function adminCreditBonusService({
  adminId,
  accountId,
  amount,
  reason,
}) {
  if (!accountId) {
    throw new Error("accountId is required");
  }
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    throw new Error("amount must be a number greater than 0");
  }

  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      const account = await Account.findOne({
        _id: accountId,
        status: "active",
      }).session(session);

      if (!account) {
        throw new Error("Account not found or inactive");
      }

      if (account.account_type !== "live") {
        throw new Error("Bonus can be credited only to live accounts");
      }

      const bonusAdd = Number(amount);
      const newBonusBalance = Number(account.bonus_balance || 0) + bonusAdd;
      const newBonusGranted = Number(account.bonus_granted || 0) + bonusAdd;
      const newEquity = Number(account.balance || 0) + newBonusBalance;

      await Account.updateOne(
        { _id: account._id },
        {
          $set: {
            bonus_balance: newBonusBalance,
            bonus_granted: newBonusGranted,
            equity: newEquity,
          },
        },
        { session },
      );

      await Transaction.create(
        [
          {
            user: account.user_id,
            account: account._id,
            type: "BONUS_CREDIT_IN",
            amount: bonusAdd,
            balanceAfter: Number(account.balance || 0),
            equityAfter: newEquity,
            status: "SUCCESS",
            referenceType: "SYSTEM",
            referenceId: account._id,
            createdBy: adminId,
            remark: reason ? `Admin bonus credit: ${reason}` : "Admin bonus credit",
          },
        ],
        { session },
      );

      result = {
        accountId: String(account._id),
        bonusAdded: bonusAdd,
        bonusBalance: newBonusBalance,
        equity: newEquity,
      };
    });
  } finally {
    session.endSession();
  }

  if (result?.accountId) {
    try {
      publishAccountBalance(result.accountId, undefined, result.bonusBalance);
      await EngineSync.updateBalance(result.accountId, null, {
        bonusBalance: result.bonusBalance,
      });
    } catch (err) {
      console.error(
        "[BONUS] EngineSync.updateBalance failed (admin credit)",
        err?.message || err,
      );
    }
  }

  return result;
}
