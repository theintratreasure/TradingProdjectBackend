// ✅ MUST BE FIRST LINE (ESM + dotenv FIX)
import "dotenv/config";

import http from "node:http";
import app from "./app.js";

import { connectDB } from "./config/database.js";
import { startMarketCron } from "./jobs/market.cron.js";
import { attachMarketWS } from "./ws/market.js";
import { MarketSchedule } from "./models/MarketSchedule.model.js";
import { marketService } from "./services/market.service.js";

// 🔥 TRADE ENGINE
import { bootstrapEngine, tradeEngine } from "./trade-engine/bootstrap.js";
import Account from "./models/Account.model.js";
import Instrument from "./models/Instrument.model.js";

const PORT = Number(process.env.PORT || 4000);

console.log("ENV CHECK:", {
  JWT_SECRET: process.env.JWT_SECRET,
  ACCOUNT_JWT_SECRET: process.env.ACCOUNT_JWT_SECRET,
});

async function start() {
  // =========================
  // 1️⃣ CONNECT DATABASE
  // =========================
  await connectDB();
  console.log("MongoDB connected");

  // =========================
  // 2️⃣ LOAD DATA FROM DB
  // =========================
const accounts = await Account.find(
  { status: "active" },
  {
    balance: 1,
    leverage: 1,
    user_id: 1,
    commission_per_lot: 1,
    swap_charge: 1,
    spread_enabled: 1
  }
).lean();


const symbols = await Instrument.find(
  { isTradeable: true },
  {
    code: 1,
    segment: 1,
    contractSize: 1,
    maxLeverage: 1,
    spread: 1,
    tickSize: 1,
    pricePrecision: 1,
  }
).lean();



  // =========================
  // 3️⃣ BOOTSTRAP TRADE ENGINE (RAM)
  // =========================
  await bootstrapEngine({
    accounts, // 👈 PURE Mongo docs (with _id)
    symbols,
  });

  console.log("[TRADE ENGINE] RAM READY");

  // Warm up market status in RAM so market-hours validation works immediately.
  // (The cron will keep refreshing it every minute.)
  try {
    const schedules = await MarketSchedule.find({}).select("segment").lean();
    const segmentSet = new Set();

    for (const s of schedules) {
      if (s?.segment) segmentSet.add(String(s.segment));
    }
    for (const sym of symbols) {
      if (sym?.segment) segmentSet.add(String(sym.segment));
    }

    for (const seg of segmentSet) {
      const res = await marketService.refreshMarketStatus(seg);
      if (res?.data) {
        tradeEngine.setMarketStatus(res.data.segment, res.data);
      }
    }

    console.log("[MARKET] status warmed:", Array.from(segmentSet));
  } catch (err) {
    console.error("[MARKET] status warmup failed:", err?.message || err);
  }

  // =========================
  // 4️⃣ CREATE SERVER
  // =========================
  const server = http.createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // =========================
  // 5️⃣ ATTACH MARKET WS
  // =========================
  attachMarketWS(server);

  // =========================
  // 6️⃣ START SERVER
  // =========================
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket Market WS at ws://localhost:${PORT}/ws/market`);
    startMarketCron();
  });
}

start().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
