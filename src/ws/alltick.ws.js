// src/ws/alltick.js
import WebSocket from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

// ========================
// AllTick API URLs
// ========================
const ALLTICK_TOKEN = process.env.ALLTICK_API_KEY;
const CRYPTO_URL = `${process.env.ALLTICK_CRYPTO_WS_URL}?token=${ALLTICK_TOKEN}`;
const STOCK_URL = `${process.env.ALLTICK_STOCK_WS_URL}?token=${ALLTICK_TOKEN}`;

// ========================
// AllTick WebSocket Manager
// ========================
class AlltickWS extends EventEmitter {
  constructor(url, marketName) {
    super();
    this.url = url;
    this.marketName = marketName; // crypto / stock
    this.client = null;
    this.subscriptions = new Map();
    this.connected = false;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.client) this.client.close();

    this.client = new WebSocket(this.url);

    this.client.on("open", () => {
      this.connected = true;
      console.log(`[${this.marketName}] Connected to AllTick WS`);
      this.emit("ready");
      this.sendHeartbeat();
      this.restoreSubscriptions();
    });

    this.client.on("message", (raw) => {
      const msg = raw.toString();

      if (msg === "pong") {
        console.log(`[${this.marketName}] Pong received`);
        return;
      }

      try {
        const json = JSON.parse(msg);

        if (json.cmd_id === 22003) {
          console.log(`[${this.marketName}] Subscription confirmed`, json);
          this.emit("subscribed", json);
        }

        if (json.cmd_id === 22999) {
          // Real-time orderbook data
          this.emit("data", json.data);
        }

        if (json.ret && json.ret !== 200) {
          console.error(`[${this.marketName}] AllTick error`, json);
        }
      } catch (err) {
        console.error(`[${this.marketName}] Invalid JSON message`, msg, err);
      }
    });

    this.client.on("close", () => {
      this.connected = false;
      console.warn(`[${this.marketName}] Connection closed, reconnecting...`);
      this.scheduleReconnect();
    });


    this.client.on("error", (err) => {
      this.connected = false;
      console.error(`[${this.marketName}] Connection error`, err);
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[${this.marketName}] Reconnecting to AllTick WS...`);
      this.connect();
    }, 2000);
  }

  sendHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (this.connected) this.client.send("ping");
    }, 10000); // every 10s
  }

  subscribe(code, level = 5) {
    this.subscriptions.set(code, level);
    this.pushSubscription();
  }

  pushSubscription() {
    if (!this.connected) return;

    const payload = {
      cmd_id: 22002,
      seq_id: 123,
      trace: "3baaa938-f92c-4a74-a228-fd49d5e2f8bc-1678419657806",
      data: {
        symbol_list: [...this.subscriptions.entries()].map(([code, depth]) => ({
          code,
          depth_level: depth,
        })),
      },
    };

    this.client.send(JSON.stringify(payload));
    console.log(`[${this.marketName}] Subscription sent:`, payload);
  }

  restoreSubscriptions() {
    if (this.subscriptions.size > 0) {
      console.log(`[${this.marketName}] Restoring subscriptions...`);
      this.pushSubscription();
    }
  }
}

// ========================
// Initialize AllTick WS connections
// ========================
export const wsCrypto = new AlltickWS(CRYPTO_URL, "crypto");
export const wsStock = new AlltickWS(STOCK_URL, "stock");

wsCrypto.connect();
wsStock.connect();

// ========================
// Multi-client registry
// ========================
export const wsClients = new Map();

export function registerClient(client) {
  const id = uuidv4();
  wsClients.set(id, client);
  return id;
}

export function removeClient(id) {
  wsClients.delete(id);
}

// ========================
// Broadcast data to all clients
// ========================
function broadcastData(market, data) {
  const msg = JSON.stringify({ type: "orderbook", market, data });
  for (const ws of wsClients.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wsCrypto.on("data", (d) => broadcastData("crypto", d));
wsStock.on("data", (d) => broadcastData("stock", d));

// ========================
// Handle incoming client messages
// ========================
export function handleClientMessage(clientWs, msg) {
  try {
    const data = JSON.parse(msg);

    if (data.type === "subscribe") {
      const { market, symbol, depth } = data;

      if (market === "crypto") wsCrypto.subscribe(symbol, depth || 5);
      if (market === "stock") wsStock.subscribe(symbol, depth || 5);

      clientWs.send(
        JSON.stringify({ status: "subscribed", market, symbol, depth: depth || 5 })
      );
      console.log(`[WS] Client subscribed: ${market} - ${symbol} - depth ${depth || 5}`);
    }
  } catch (err) {
    console.error("Invalid client message", msg, err);
    clientWs.send(JSON.stringify({ status: "error", error: err.message }));
  }
}
