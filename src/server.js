// ✅ MUST BE FIRST LINE (ESM + dotenv FIX)
import "dotenv/config";

import http from "node:http";
import app from "./app.js";

import { connectDB } from "./config/database.js";
import { startMarketCron } from "./jobs/market.cron.js";
// import { attachMarketWS } from "./ws/market.js";

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
    { balance: 1, leverage: 1 }
  ).lean();


  const symbols = await Instrument.find(
    { isTradeable: true },
    { code: 1, contractSize: 1, maxLeverage: 1 }
  ).lean();


  // =========================
  // 3️⃣ BOOTSTRAP TRADE ENGINE (RAM)
  // =========================
  await bootstrapEngine({
    accounts, // 👈 PURE Mongo docs (with _id)
    symbols,
  });

  console.log("[TRADE ENGINE] RAM READY");

  // =========================
  // 4️⃣ CREATE SERVER
  // =========================
  const server = http.createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // =========================
  // 5️⃣ ATTACH MARKET WS
  // =========================
  // attachMarketWS(server);

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
