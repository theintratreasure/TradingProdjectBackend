// src/ws/market.js
import { WebSocketServer } from "ws";
import {
  registerClient,
  removeClient,
  handleClientMessage,
} from "./alltick.ws.js";

/**
 * Attach WebSocket market endpoint to HTTP server
 */
export function attachMarketWS(server) {
  const wss = new WebSocketServer({ server, path: "/ws/market" });

  wss.on("connection", (ws) => {
    const id = registerClient(ws);
    console.log(`[WS] Client connected: ${id}`);

    ws.send(
      JSON.stringify({ status: "connected", message: "Connected to Market WS" })
    );

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

  console.log("[WS] Market WebSocket attached at /ws/market");
}
