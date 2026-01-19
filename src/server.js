import dotenv from "dotenv";
import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { attachMarketWS } from "./ws/market.js";

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await connectDB();
  console.log("MongoDB connected");

  const server = http.createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // attach websocket
  attachMarketWS(server);

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket Market WS at ws://localhost:${PORT}/ws/market`);
  });
}

start().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
