// src/ws/alltick.js
import WebSocket from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { HighLowService } from "../services/highlow.service.js";

dotenv.config();

// ========================
// AllTick API URLs
// ========================
const ALLTICK_TOKEN = String(process.env.ALLTICK_API_KEY || "").trim();

const CRYPTO_URL = `${process.env.ALLTICK_CRYPTO_WS_URL}?token=${ALLTICK_TOKEN}`;
const STOCK_URL = `${process.env.ALLTICK_STOCK_WS_URL}?token=${ALLTICK_TOKEN}`;

// ========================
// Helpers
// ========================
const nowTs = () => Date.now();

const buildTrace = () => {
  return `${uuidv4()}-${nowTs()}`;
};

const normalizeMarket = (v) => String(v || "").trim().toLowerCase();
const normalizeSymbol = (v) => String(v || "").trim().toUpperCase();

const makeKey = (market, symbol) =>
  `${normalizeMarket(market)}:${normalizeSymbol(symbol)}`;

// ========================
// AllTick WebSocket Manager
// ========================
class AlltickWS extends EventEmitter {
  constructor(url, marketName) {
    super();
    this.url = url;
    this.marketName = marketName; // crypto / stock
    this.client = null;
    this.subscriptions = new Map(); // code -> depth
    this.connected = false;

    this.heartbeatTimer = null;
    this.reconnectTimer = null;

    this.seqId = 1;
    this.pushTimer = null;

    // ✅ reconnect stability
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // ✅ heartbeat safety
    this.lastPongAt = 0;
  }

  nextSeqId() {
    this.seqId += 1;
    if (this.seqId > 999999999) this.seqId = 1;
    return this.seqId;
  }

  connect() {
    if (!ALLTICK_TOKEN) {
      console.error(`[${this.marketName}] ALLTICK_API_KEY missing`);
      return;
    }

    // ✅ avoid double connect loops
    if (this.isConnecting) return;
    this.isConnecting = true;

    if (this.client) {
      try {
        this.client.terminate();
      } catch (e) {}
    }

    this.client = new WebSocket(this.url, {
      handshakeTimeout: 10000,
    });

    this.client.on("open", () => {
      this.connected = true;
      this.isConnecting = false;

      // ✅ reset backoff after success
      this.reconnectAttempts = 0;

      // ✅ set initial pong time
      this.lastPongAt = Date.now();

      console.log(`[${this.marketName}] Connected to AllTick WS`);

      this.emit("ready");
      this.startHeartbeat();
      this.restoreSubscriptions();
    });

    this.client.on("message", (raw) => {
      const msg = raw.toString();

      try {
        const json = JSON.parse(msg);

        // subscription confirm
        if (json.cmd_id === 22003) {
          if (json.ret === 200) {
            console.log(`[${this.marketName}] Subscription confirmed`, json);
          } else {
            console.error(`[${this.marketName}] Subscription failed`, json);
          }
          this.emit("subscribed", json);
          return;
        }

        // real-time orderbook data
        if (json.cmd_id === 22999 && json.data) {
          this.emit("data", json.data);
          return;
        }

        // log errors
        if (typeof json.ret === "number" && json.ret !== 200) {
          console.error(`[${this.marketName}] AllTick error`, json);
        }
      } catch (err) {
        console.error(`[${this.marketName}] Invalid JSON message`, msg);
      }
    });

    this.client.on("pong", () => {
      this.lastPongAt = Date.now();
    });

    this.client.on("close", (code, reason) => {
      this.connected = false;
      this.isConnecting = false;

      const reasonText = String(reason || "").trim();

      console.warn(
        `[${this.marketName}] Connection closed (code=${code}) reason=${reasonText}`
      );

      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.client.on("error", (err) => {
      this.connected = false;
      this.isConnecting = false;

      console.error(`[${this.marketName}] Connection error`, err);

      this.stopHeartbeat();
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    // ✅ exponential backoff: 2s, 4s, 8s, 16s, 30s max
    this.reconnectAttempts += 1;
    const delay = Math.min(
      2000 * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[${this.marketName}] Reconnecting to AllTick WS...`);
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    // ✅ init pong timestamp
    if (!this.lastPongAt) this.lastPongAt = Date.now();

    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      if (!this.client) return;
      if (this.client.readyState !== WebSocket.OPEN) return;

      const diff = Date.now() - this.lastPongAt;

      // ✅ if no pong for 45s, force reconnect
      if (diff > 45000) {
        console.warn(`[${this.marketName}] Pong timeout, reconnecting...`);
        try {
          this.client.terminate();
        } catch (e) {}
        return;
      }

      try {
        this.client.ping();
      } catch (e) {}
    }, 20000); // ✅ ping every 20s
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  subscribe(codeRaw, levelRaw = 5) {
    const code = normalizeSymbol(codeRaw);
    const depth = Number(levelRaw || 5);

    if (!code) return;

    const finalDepth = Number.isFinite(depth) ? depth : 5;

    const prev = this.subscriptions.get(code);
    if (prev === finalDepth) return;

    this.subscriptions.set(code, finalDepth);
    this.schedulePushSubscription();
  }

  schedulePushSubscription() {
    if (this.pushTimer) clearTimeout(this.pushTimer);

    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.pushSubscription();
    }, 200);
  }

  pushSubscription() {
    if (!this.connected) return;
    if (!this.client) return;
    if (this.client.readyState !== WebSocket.OPEN) return;
    if (this.subscriptions.size === 0) return;

    const symbolList = [];
    for (const [code, depth] of this.subscriptions.entries()) {
      symbolList.push({
        code,
        depth_level: depth,
      });
    }

    const payload = {
      cmd_id: 22002,
      seq_id: this.nextSeqId(),
      trace: buildTrace(),
      data: {
        symbol_list: symbolList,
      },
    };

    try {
      this.client.send(JSON.stringify(payload));
      console.log(`[${this.marketName}] Subscription sent (${symbolList.length})`);
    } catch (e) {
      console.error(`[${this.marketName}] Failed to send subscription`, e);
    }
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

// clientId -> Set("market:SYMBOL")
const clientSubscriptions = new Map();

export function registerClient(client) {
  const id = uuidv4();
  client.clientId = id;

  wsClients.set(id, client);
  clientSubscriptions.set(id, new Set());

  return id;
}

export function removeClient(id) {
  clientSubscriptions.delete(id);
  wsClients.delete(id);
}

// ========================
// Broadcast only to subscribed clients
// ========================
function broadcastData(market, data) {
  const rawCode =
    data?.code ||
    data?.symbol ||
    data?.s ||
    data?.instrument ||
    data?.instrument_code;

  const symbol = normalizeSymbol(rawCode);
  if (!symbol) return;

  const key = makeKey(market, symbol);
  const msg = JSON.stringify({ type: "orderbook", market, data });

  for (const [clientId, ws] of wsClients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    const subs = clientSubscriptions.get(clientId);
    if (!subs) continue;

    if (!subs.has(key)) continue;

    try {
      ws.send(msg);
    } catch (e) {}
  }
}

wsCrypto.on("data", (d) => broadcastData("crypto", d));
wsStock.on("data", (d) => broadcastData("stock", d));

// ========================
// Handle incoming client messages
// ========================
export async function handleClientMessage(clientWs, msg) {
  try {
    const data = JSON.parse(msg);

    const clientId = String(clientWs.clientId || "").trim();
    if (!clientId) {
      clientWs.send(JSON.stringify({ status: "error", error: "clientId missing" }));
      return;
    }

    const subs = clientSubscriptions.get(clientId);
    if (!subs) {
      clientWs.send(
        JSON.stringify({ status: "error", error: "client not registered" })
      );
      return;
    }

    const type = String(data.type || "").trim();
    const market = normalizeMarket(data.market);
    const symbol = normalizeSymbol(data.symbol);

    if (!type || !market || !symbol) {
      clientWs.send(
        JSON.stringify({
          status: "error",
          error: "type, market and symbol required",
        })
      );
      return;
    }

    const key = makeKey(market, symbol);

    // ✅ SUBSCRIBE
    if (type === "subscribe") {
      const depth = Number(data.depth || 5);
      const finalDepth = Number.isFinite(depth) ? depth : 5;

      const already = subs.has(key);
      subs.add(key);

      if (!already) {
        if (market === "crypto") wsCrypto.subscribe(symbol, finalDepth);
        if (market === "stock") wsStock.subscribe(symbol, finalDepth);
      }

      // ✅ Fetch Day High/Low (Redis cached + inflight protected)
      const hlRes = await HighLowService.getDayHighLow(market, symbol);

      const dayHigh =
        hlRes && hlRes.data && typeof hlRes.data.high === "number"
          ? hlRes.data.high
          : null;

      const dayLow =
        hlRes && hlRes.data && typeof hlRes.data.low === "number"
          ? hlRes.data.low
          : null;

      clientWs.send(
        JSON.stringify({
          status: "subscribed",
          market,
          symbol,
          depth: finalDepth,
          dayHigh,
          dayLow,
        })
      );

      return;
    }

    // ✅ UNSUBSCRIBE
    if (type === "unsubscribe") {
      subs.delete(key);

      clientWs.send(
        JSON.stringify({
          status: "unsubscribed",
          market,
          symbol,
        })
      );

      return;
    }

    clientWs.send(JSON.stringify({ status: "error", error: "unknown message type" }));
  } catch (err) {
    console.error("Invalid client message", msg);
    clientWs.send(JSON.stringify({ status: "error", error: "Invalid JSON" }));
  }
}
