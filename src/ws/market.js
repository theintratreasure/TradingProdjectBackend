// src/ws/market.js
import WebSocket, { WebSocketServer } from "ws";
import { wsClients, registerClient, removeClient, wsCrypto, wsStock } from "./alltick.ws.js";
/**
 * Attach WebSocket market endpoint to HTTP server
 */
export function attachMarketWS(server) {
  // Create WebSocket server on path /ws/market
  const wss = new WebSocketServer({ server, path: "/ws/market" });

  wss.on("connection", (ws, req) => {
    const id = registerClient(ws);
    console.log(`[WS] Client connected: ${id}`);

    // Send initial message
    ws.send(JSON.stringify({ status: "connected", message: "Connected to Market WS" }));

    // Listen for client messages
    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg.toString());

        if (data.type === "subscribe") {
          const { market, symbol, depth } = data;

          // Default depth = 5
          const lvl = depth || 5;

          if (market === "crypto") {
            wsCrypto.subscribe(symbol, lvl);
          } else if (market === "stock") {
            wsStock.subscribe(symbol, lvl);
          }

          ws.send(JSON.stringify({
            status: "subscribed",
            market,
            symbol,
            depth: lvl
          }));

          console.log(`[WS] Client ${id} subscribed: ${market} - ${symbol} - depth ${lvl}`);
        } else {
          console.log(`[WS] Unknown message from ${id}:`, data);
        }
      } catch (err) {
        console.log(`[WS] Invalid message from ${id}:`, err);
      }
    });

    // Handle client disconnect
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
