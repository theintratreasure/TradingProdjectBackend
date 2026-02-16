import mongoose from "mongoose";

import redis, { isRedisReady } from "../config/redis.js";
import Account from "../models/Account.model.js";
import Trade from "../models/Trade.model.js";
import Transaction from "../models/Transaction.model.js";
import EngineSync from "../trade-engine/EngineSync.js";
import { publishAccountBalance } from "../trade-engine/EngineSyncBus.js";

function formatYmd(date, timeZone) {
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function releaseRedisLock(key, value) {
  if (!isRedisReady()) return;

  // Delete only if the lock value matches (safe release).
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    await redis.eval(script, 1, key, value);
  } catch (err) {
    console.warn("[SWAP_CRON] lock release failed:", err?.message || err);
  }
}

/**
 * Overnight swap rollover
 * - Charges swap once per day per account (idempotent via Account.swap_last_charged_ymd)
 * - Writes a Transaction history record (type: SWAP)
 * - Updates Trade Engine RAM balances (post-commit)
 *
 * NOTE:
 * This system uses Trade.swap as "swap-per-day" (computed at trade open).
 * The cron sums swap-per-day across OPEN trades and applies a single debit/credit per account.
 */
export async function runSwapRollover({
  now = new Date(),
  timeZone = process.env.SWAP_CRON_TZ || process.env.TZ || undefined,
  batchSize = Number(process.env.SWAP_CRON_BATCH_SIZE) || 200,
  lockTtlSeconds = Number(process.env.SWAP_CRON_LOCK_TTL_SECONDS) || 60 * 60 * 3,
} = {}) {
  const startedAt = Date.now();
  const ymd = formatYmd(now, timeZone);

  const lockKey = `cron:swap:${ymd}`;
  const lockValue = `${process.pid}:${Date.now()}`;

  // Best-effort lock (prevents overlap in multi-instance; safe in single-instance too).
  if (isRedisReady()) {
    const ok = await redis.set(lockKey, lockValue, "NX", "EX", lockTtlSeconds);
    if (!ok) {
      console.log("[SWAP_CRON] skipped (lock exists):", { ymd, lockKey });
      return { success: true, skipped: true, ymd };
    }
  } else {
    console.warn("[SWAP_CRON] Redis not ready, running without lock:", { ymd });
  }

  try {
    console.log("[SWAP_CRON] run started:", { ymd, timeZone });

    /* =========================
       1) FIND ACCOUNTS TO CHARGE
       - OPEN trades only
       - swap_enabled + active accounts only
       - skip accounts already charged today (swap_last_charged_ymd)
    ========================== */

    const pipeline = [
      { $match: { status: "OPEN" } },
      {
        $group: {
          _id: "$accountId",
          userId: { $first: "$userId" },
          swapToCharge: { $sum: { $ifNull: ["$swap", 0] } }, // may be credit (-) or charge (+)
          openTrades: { $sum: 1 },
        },
      },
      { $match: { swapToCharge: { $ne: 0 } } },
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "account",
        },
      },
      { $unwind: "$account" },
      {
        $match: {
          "account.status": "active",
          "account.swap_enabled": true,
          $or: [
            { "account.swap_last_charged_ymd": { $exists: false } },
            { "account.swap_last_charged_ymd": null },
            { "account.swap_last_charged_ymd": { $ne: ymd } },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          accountId: "$_id",
          userId: 1,
          swapToCharge: 1,
          openTrades: 1,
        },
      },
    ];

    const charges = await Trade.aggregate(pipeline).allowDiskUse(true);

    if (!Array.isArray(charges) || charges.length === 0) {
      console.log("[SWAP_CRON] nothing to charge:", { ymd });
      return { success: true, ymd, chargedAccounts: 0, total: 0 };
    }

    console.log("[SWAP_CRON] candidates:", {
      ymd,
      accounts: charges.length,
    });

    /* =========================
       2) APPLY CHARGES (BATCHED)
       - Atomic per batch using Mongo transactions
       - Updates: balance + equity (equity kept in sync with balance)
       - Writes: Transaction (type: SWAP)
       - Marks: swap_last_charged_ymd
    ========================== */

    const safeBatchSize = Math.min(Math.max(batchSize, 10), 1000);

    let chargedAccounts = 0;
    let totalCharged = 0; // sum of debits (swapToCharge > 0)
    let totalCredited = 0; // sum of credits (swapToCharge < 0)
    let skippedInsufficientBalance = 0;

    for (let i = 0; i < charges.length; i += safeBatchSize) {
      const batch = charges.slice(i, i + safeBatchSize);
      const session = await mongoose.startSession();

      try {
        const updatedInBatch = await session.withTransaction(async () => {
          const updated = [];

          for (const item of batch) {
            const swapToChargeRaw = Number(item.swapToCharge);
            if (!Number.isFinite(swapToChargeRaw) || swapToChargeRaw === 0) {
              continue;
            }

            // Normalize precision (keep it consistent with engine precision)
            // NOTE: swap is always a DEBIT in this system (no credits).
            const swapToCharge = Math.abs(Number(swapToChargeRaw.toFixed(8)));
            if (!swapToCharge) continue;

            const baseFilter = {
              _id: item.accountId,
              status: "active",
              swap_enabled: true,
              $or: [
                { swap_last_charged_ymd: { $exists: false } },
                { swap_last_charged_ymd: null },
                { swap_last_charged_ymd: { $ne: ymd } },
              ],
            };

            // Prevent negative balances (Transaction.balanceAfter enforces min: 0).
            const filter = { ...baseFilter, balance: { $gte: swapToCharge } };

            const accountAfter = await Account.findOneAndUpdate(
              filter,
              [
                {
                  $set: {
                    // Keep DB equity aligned with balance for non-price operations.
                    // (Real-time equity is tracked inside trade-engine RAM.)
                    balance: { $subtract: ["$balance", swapToCharge] },
                    equity: {
                      $add: [
                        { $subtract: ["$balance", swapToCharge] },
                        { $ifNull: ["$bonus_balance", 0] },
                      ],
                    },
                    swap_last_charged_ymd: ymd,
                    swap_last_charged_at: now,
                  },
                },
              ],
              { new: true, session, updatePipeline: true }
            ).lean();

            if (!accountAfter) {
              if (swapToCharge > 0) skippedInsufficientBalance += 1;
              continue;
            }

            const absAmount = Math.abs(swapToCharge);

            await Transaction.create(
              [
                {
                  user: item.userId,
                  account: item.accountId,
                  type: "SWAP",
                  amount: absAmount,
                  balanceAfter: Number(accountAfter.balance),
                  equityAfter: Number(accountAfter.equity),
                  status: "SUCCESS",
                  referenceType: "SYSTEM",
                  remark: `Overnight swap charged (${ymd})`,
                },
              ],
              { session }
            );

            updated.push({
              accountId: String(item.accountId),
              balance: Number(accountAfter.balance),
              swapToCharge,
            });
          }

          return updated;
        });

        // Post-commit: keep trade-engine RAM in sync (no DB reads here).
        for (const u of updatedInBatch || []) {
          chargedAccounts += 1;
          totalCharged += u.swapToCharge;

          publishAccountBalance(u.accountId, u.balance);

          EngineSync.updateBalance(u.accountId, u.balance).catch((err) => {
            console.error("[SWAP_CRON] EngineSync.updateBalance failed:", {
              accountId: u.accountId,
              message: err?.message || err,
            });
          });
        }
      } finally {
        session.endSession();
      }

      // Yield between batches to keep the event loop responsive.
      await new Promise((r) => setImmediate(r));
    }

    const durationMs = Date.now() - startedAt;
    console.log("[SWAP_CRON] run completed:", {
      ymd,
      chargedAccounts,
      skippedInsufficientBalance,
      totalCharged: Number(totalCharged.toFixed(8)),
      totalCredited: Number(totalCredited.toFixed(8)),
      durationMs,
    });

    return {
      success: true,
      ymd,
      chargedAccounts,
      skippedInsufficientBalance,
      totalCharged: Number(totalCharged.toFixed(8)),
      totalCredited: Number(totalCredited.toFixed(8)),
      durationMs,
    };
  } catch (err) {
    console.error("[SWAP_CRON] run failed:", err?.message || err);
    throw err;
  } finally {
    await releaseRedisLock(lockKey, lockValue);
  }
}
