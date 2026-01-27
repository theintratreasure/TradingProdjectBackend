// ✅ MUST BE FIRST LINE (ESM + dotenv FIX)
import "dotenv/config";

import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { startMarketCron } from "./jobs/market.cron.js";
// import { attachMarketWS } from "./ws/market.js";

const PORT = Number(process.env.PORT || 4000);

// optional sanity check (remove later if you want)
console.log("ENV CHECK:", {
  JWT_SECRET: process.env.JWT_SECRET,
  ACCOUNT_JWT_SECRET: process.env.ACCOUNT_JWT_SECRET,
});

async function start() {
  await connectDB();
  console.log("MongoDB connected");

  const server = http.createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // attach websocket if needed
  // attachMarketWS(server);

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
