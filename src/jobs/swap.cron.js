import cron from "node-cron";
import { runSwapRollover } from "../services/swap.service.js";

export const startSwapCron = () => {
  const schedule = process.env.SWAP_CRON_SCHEDULE || "0 0 * * *"; // every day 00:00
  const timeZone = process.env.SWAP_CRON_TZ || process.env.TZ || undefined;

  const run = async () => {
    try {
      await runSwapRollover({ timeZone });
    } catch (err) {
      console.error("[SWAP_CRON] cron error:", err?.message || err);
    }
  };

  // Run once on startup (catch-up) unless explicitly disabled.
  // If today's rollover already happened, the service will skip via `swap_last_charged_ymd`.
  if (process.env.SWAP_CRON_RUN_ON_START !== "false") {
    run();
  }

  const options = {};
  if (timeZone) options.timezone = timeZone;

  cron.schedule(schedule, run, options);

  console.log("[SWAP_CRON] started:", {
    schedule,
    timeZone: timeZone || "system",
  });
};

