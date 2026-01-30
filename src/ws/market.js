import { WebSocketServer } from "ws";
import {
  registerClient,
  removeClient,
  handleClientMessage,
} from "./alltick.ws.js";

/**
 * Single WebSocket server that supports both routes.
 *
 * Connect to:
 *   - wss://<host>/ws/market   (auto-joins market route)
 *   - wss://<host>/ws/account  (auto-joins account route)
 *
 * This keeps a single process WebSocket listener. When you run multiple Node workers
 * behind a load balancer, each worker will subscribe to Redis and forward only relevant events.
 */
export function attachMarketWS(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const id = registerClient(ws);

    // detect route from requested URL path
    const url = req?.url || "";
    if (url.startsWith("/ws/market")) ws.routes.add("market");
    if (url.startsWith("/ws/account")) ws.routes.add("account");

    console.log(`[WS] Client connected: ${id} routes=${Array.from(ws.routes).join(",")}`);

    try {
      ws.send(JSON.stringify({ status: "connected", routes: Array.from(ws.routes) }));
    } catch {}

    ws.on("message", (msg) => {
      handleClientMessage(ws, msg.toString());
    });

    ws.on("close", () => {
      removeClient(id);
      console.log(`[WS] Client disconnected: ${id}`);
    });

    ws.on("error", (err) => {
      console.log(`[WS] Client ${id} error:`, err);
    });
  });

  console.log("[WS] Single WebSocket attached for /ws/market & /ws/account");
}
