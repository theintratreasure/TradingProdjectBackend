// ws/alltick.manager.js
import WebSocket from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import Redis from "ioredis";
import { HighLowService } from "../services/highlow.service.js";
import { tradeEngine } from "../trade-engine/bootstrap.js";
import { engineEvents } from "../trade-engine/EngineEvents.js";

dotenv.config();

// ========================
// CONFIG
// ========================
const ALLTICK_TOKEN = String(process.env.ALLTICK_API_KEY || "").trim();
const CRYPTO_URL = `${process.env.ALLTICK_CRYPTO_WS_URL}?token=${ALLTICK_TOKEN}`;
const STOCK_URL = `${process.env.ALLTICK_STOCK_WS_URL}?token=${ALLTICK_TOKEN}`;

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_CHANNEL = "engine:events";

// ========================
// Redis pub/sub
// ========================
const redisPub = new Redis(REDIS_URL);
const redisSub = new Redis(REDIS_URL);

redisSub.subscribe(REDIS_CHANNEL, (err) => {
  if (err) console.error("[REDIS] subscribe error", err);
  else console.log("[REDIS] subscribed to", REDIS_CHANNEL);
});

// ========================
// Helpers
// ========================
const nowTs = () => Date.now();
const buildTrace = () => `${uuidv4()}-${nowTs()}`;

const normalizeMarket = (v) => String(v || "").trim().toLowerCase();
const normalizeSymbol = (v) =>
  String(v || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
const makeKey = (market, symbol) =>
  `${normalizeMarket(market)}:${normalizeSymbol(symbol)}`;

// ========================
// AllTick WS Manager
// ========================
class AlltickWS extends EventEmitter {
  constructor(url, marketName) {
    super();
    this.url = url;
    this.marketName = marketName;

    this.client = null;
    this.subscriptions = new Map();
    this.connected = false;

    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.seqId = 1;
    this.pushTimer = null;

    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.manualClose = false;
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

    // Prevent duplicate attempts if already connected or connecting
    if (this.connected || this.isConnecting) return;
    this.isConnecting = true;
    this.manualClose = false;

    // Clean-up previous client if any
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.terminate();
      } catch {}
    }

    console.log(`[${this.marketName}] Connecting to AllTick...`);

    this.client = new WebSocket(this.url, { handshakeTimeout: 10000 });

    this.client.on("open", () => {
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      console.log(`[${this.marketName}] Connected to AllTick WS`);
      this.emit("ready");
      this.startHeartbeat();
      this.restoreSubscriptions();
    });

    this.client.on("message", (raw) => {
      try {
        const json = JSON.parse(raw.toString());

        // heartbeat/data/subscribed handling based on provider cmd_id
        if (json.cmd_id === 22003) {
          this.emit("subscribed", json);
          return;
        }

        if (json.cmd_id === 22999 && json.data) {
          this.emit("data", json.data);
        }

        // if provider sends explicit heartbeat ack (adjust cmd_id if needed)
        if (json.cmd_id === 22998) {
          // provider-echo for our heartbeat; just ignore or emit if needed
          this.emit("heartbeat_ack", json);
        }
      } catch (err) {
        console.error(`[${this.marketName}] Invalid JSON`, err);
      }
    });

    // NOTE: do not rely on ws.pong() event for AllTick (custom protocol)
    // remove pong handler entirely to avoid false timeouts

    this.client.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "";
      console.warn(`[${this.marketName}] WS Closed`, code, reasonStr);
      this.cleanupAndReconnect(code, reasonStr);
    });

    this.client.on("error", (err) => {
      // log error message only (avoid crashing)
      console.error(`[${this.marketName}] WS Error`, err && err.message ? err.message : err);
      this.cleanupAndReconnect();
    });
  }

  // central cleanup + reconnect trigger
  cleanupAndReconnect(code = null, reason = "") {
    try {
      if (this.client) {
        try {
          this.client.removeAllListeners();
        } catch {}
        try {
          this.client.terminate();
        } catch {}
      }
    } catch {}

    this.client = null;
    this.connected = false;
    this.isConnecting = false;
    this.stopHeartbeat();

    // if manualClose was requested, do not schedule reconnect
    if (this.manualClose) {
      console.log(`[${this.marketName}] manual close, not reconnecting`);
      return;
    }

    // for normal close code 1000 we still attempt reconnect (network flaps),
    // but do not spam — scheduleReconnect has guard against duplicates
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    // increase attempts and compute backoff (min 5s, max 60s)
    this.reconnectAttempts += 1;
    const delay = Math.min(5000 * this.reconnectAttempts, 60000);

    console.log(`[${this.marketName}] Reconnecting in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // guard: don't attempt if already connected
      if (this.connected || this.isConnecting) return;
      this.connect();
    }, delay);
  }

  // Provider expects JSON heartbeat (not ws.ping). Use provider cmd_id for heartbeat.
  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (!this.connected || !this.client) return;

      const payload = {
        cmd_id: 22998, // provider-specific heartbeat id — adjust if provider docs differ
        seq_id: this.nextSeqId(),
        trace: buildTrace(),
      };

      try {
        this.client.send(JSON.stringify(payload));
      } catch (err) {
        // if send fails, attempt termination and reconnect (will be handled by close/error)
        console.error(`[${this.marketName}] Heartbeat send failed`, err && err.message ? err.message : err);
        try {
          this.client.terminate();
        } catch {}
      }
    }, 20000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // allow graceful manual close (useful for shutdown)
  closeManual() {
    this.manualClose = true;
    try {
      if (this.client) this.client.close(1000, "manual");
    } catch {}
    this.stopHeartbeat();
  }

  subscribe(codeRaw, levelRaw = 5) {
    const code = normalizeSymbol(codeRaw);
    const depth = Number(levelRaw) || 5;

    if (!code) return;

    this.subscriptions.set(code, depth);
    this.schedulePushSubscription();
  }

  schedulePushSubscription() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.pushSubscription(), 200);
  }

  pushSubscription() {
    if (!this.connected || !this.client) return;
    if (this.subscriptions.size === 0) return;

    const symbolList = [];
    for (const [code, depth] of this.subscriptions.entries()) {
      symbolList.push({ code, depth_level: depth });
    }

    const payload = {
      cmd_id: 22002,
      seq_id: this.nextSeqId(),
      trace: buildTrace(),
      data: { symbol_list: symbolList },
    };

    try {
      this.client.send(JSON.stringify(payload));
    } catch (err) {
      console.error(`[${this.marketName}] pushSubscription send failed`, err && err.message ? err.message : err);
    }
  }

  restoreSubscriptions() {
    if (this.subscriptions.size > 0) {
      this.pushSubscription();
    }
  }
}

// ========================
// INIT CONNECTIONS
// ========================
export const wsCrypto = new AlltickWS(CRYPTO_URL, "crypto");
export const wsStock = new AlltickWS(STOCK_URL, "stock");

// start connections (singletons)
wsCrypto.connect();
wsStock.connect();

// ========================
// CLIENT REGISTRY + INDEXES
// ========================
export const wsClients = new Map(); // clientId -> ws
const clientSubscriptions = new Map(); // clientId -> Set(keys)
const accountIdMap = new Map(); // accountId -> Set(clientId)

function ensureClientSubs(clientId) {
  if (!clientSubscriptions.has(clientId)) clientSubscriptions.set(clientId, new Set());
}
function ensureAccountSet(accountId) {
  if (!accountIdMap.has(accountId)) accountIdMap.set(accountId, new Set());
}

// register client
export function registerClient(client) {
  const id = uuidv4();
  client.clientId = id;
  client.routes = new Set(); // "market" and/or "account"
  wsClients.set(id, client);
  clientSubscriptions.set(id, new Set());
  console.log("[WS CLIENT] Connected:", id);
  return id;
}

// remove client and cleanup maps
export function removeClient(id) {
  const ws = wsClients.get(id);
  if (!ws) return;
  // remove from accountIdMap if identified
  if (ws.accountId) {
    const set = accountIdMap.get(ws.accountId);
    if (set) {
      set.delete(id);
      if (set.size === 0) accountIdMap.delete(ws.accountId);
    }
  }

  // cleanup subscriptions map
  clientSubscriptions.delete(id);
  wsClients.delete(id);
  console.log("[WS CLIENT] Disconnected:", id);
}

// ========================
// BROADCAST ORDERBOOK (market route only)
// ========================
function broadcastData(market, data) {
  const raw =
    data?.code ||
    data?.symbol ||
    data?.s ||
    data?.instrument ||
    data?.instrument_code;

  const symbol = normalizeSymbol(raw);
  if (!symbol) return;

  const key = makeKey(market, symbol);
  const msg = JSON.stringify({ type: "orderbook", market, data });

  for (const [id, ws] of wsClients.entries()) {
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (!ws.routes || !ws.routes.has("market")) continue;
    const subs = clientSubscriptions.get(id);
    if (!subs || !subs.has(key)) continue;
    try {
      ws.send(msg);
    } catch (err) {
      console.error("[WS SEND ERROR] orderbook ->", err);
    }
  }
}

// ========================
// FEED PRICE TO TRADE ENGINE
// ========================
function feedEnginePrice(data) {
  const raw =
    data?.code ||
    data?.symbol ||
    data?.s ||
    data?.instrument ||
    data?.instrument_code;

  const normalized = normalizeSymbol(raw);
  const symbol = normalized.startsWith("FX")
    ? normalized.replace(/^FX/, "")
    : normalized;

  const bestBid = data?.bids?.[0]?.price;
  const bestAsk = data?.asks?.[0]?.price;

  const bid = Number(bestBid);
  const ask = Number(bestAsk);

  tradeEngine.onTick(symbol, bid, ask);
}

// ========================
// ALLTICK DATA HANDLERS
// ========================
wsCrypto.on("data", (d) => {
  broadcastData("crypto", d);
  feedEnginePrice(d);
});

wsStock.on("data", (d) => {
  broadcastData("stock", d);
  feedEnginePrice(d);
});

// ========================
// ENGINE -> REDIS PUB on local engineEvents
// (so single-engine or local engine emits get propagated to other workers)
// ========================
function publishEngineEvent(eventType, payload) {
  const wrapper = JSON.stringify({ eventType, payload, ts: Date.now() });
  redisPub.publish(REDIS_CHANNEL, wrapper).catch((err) => {
    console.error("[REDIS] publish error", err);
  });
}

// when local engine emits, publish to redis
engineEvents.on("LIVE_ACCOUNT", (payload) => {
  try {
    publishEngineEvent("LIVE_ACCOUNT", payload);
  } catch (err) {
    console.error("[ENGINE] publish LIVE_ACCOUNT error", err);
  }
});
engineEvents.on("LIVE_POSITION", (payload) => {
  try {
    publishEngineEvent("LIVE_POSITION", payload);
  } catch (err) {
    console.error("[ENGINE] publish LIVE_POSITION error", err);
  }
});

// ========================
// REDIS SUBSCRIBER -> forward to relevant local clients
// ========================
redisSub.on("message", (channel, message) => {
  if (channel !== REDIS_CHANNEL) return;
  let obj;
  try {
    obj = JSON.parse(message);
  } catch (err) {
    console.error("[REDIS] invalid message", err);
    return;
  }

  const { eventType, payload } = obj;
  if (!eventType || !payload) return;

  if (eventType === "LIVE_ACCOUNT") {
    const s = accountIdMap.get(String(payload.accountId));
    if (!s || s.size === 0) return;
    const msgStr = JSON.stringify({ type: "live_account", data: payload });
    for (const clientId of s) {
      const ws = wsClients.get(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (!ws.routes || !ws.routes.has("account")) continue;
      try {
        ws.send(msgStr);
      } catch (err) {
        console.error("[WS SEND ERROR] live_account ->", err);
      }
    }
    return;
  }

  if (eventType === "LIVE_POSITION") {
    const s = accountIdMap.get(String(payload.accountId));
    if (!s || s.size === 0) return;
    const msgStr = JSON.stringify({ type: "live_position", data: payload });
    for (const clientId of s) {
      const ws = wsClients.get(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (!ws.routes || !ws.routes.has("account")) continue;
      try {
        ws.send(msgStr);
      } catch (err) {
        console.error("[WS SEND ERROR] live_position ->", err);
      }
    }
    return;
  }
});

// ========================
// CLIENT MESSAGE HANDLER
// ========================
export async function handleClientMessage(clientWs, msg) {
  try {
    const data = JSON.parse(msg);
    const subs = clientSubscriptions.get(clientWs.clientId);
    if (!subs) return;

    // JOIN route (not strictly required if path-auto-joined)
    if (data.type === "join" && data.route) {
      const route = String(data.route).toLowerCase();
      if (route === "market" || route === "account") {
        clientWs.routes.add(route);
        try {
          clientWs.send(JSON.stringify({ status: "joined", route }));
        } catch {}
      }
      return;
    }

    // LEAVE
    if (data.type === "leave" && data.route) {
      const route = String(data.route).toLowerCase();
      if (route === "market" || route === "account") {
        clientWs.routes.delete(route);
        try {
          clientWs.send(JSON.stringify({ status: "left", route }));
        } catch {}
      }
      return;
    }

    // MARKET subscribe
    if (data.type === "subscribe") {
      if (!clientWs.routes.has("market")) {
        try {
          clientWs.send(JSON.stringify({ status: "error", error: "join market route first" }));
        } catch {}
        return;
      }

      const market = normalizeMarket(data.market);
      const symbol = normalizeSymbol(data.symbol);
      const key = makeKey(market, symbol);

      subs.add(key);

      if (market === "crypto") wsCrypto.subscribe(symbol);
      if (market === "stock") wsStock.subscribe(symbol);

      const hl = await HighLowService.getDayHighLow(market, symbol).catch(() => null);

      try {
        clientWs.send(
          JSON.stringify({
            status: "subscribed",
            symbol,
            dayHigh: hl?.data?.high ?? null,
            dayLow: hl?.data?.low ?? null,
          })
        );
      } catch (err) {
        console.error("[WS SEND ERROR] subscribe ack ->", err);
      }
      return;
    }

    // MARKET unsubscribe
    if (data.type === "unsubscribe") {
      if (!clientWs.routes.has("market")) return;
      const market = normalizeMarket(data.market);
      const symbol = normalizeSymbol(data.symbol);
      const key = makeKey(market, symbol);
      subs.delete(key);
      try {
        clientWs.send(JSON.stringify({ status: "unsubscribed", symbol }));
      } catch (err) {
        console.error("[WS SEND ERROR] unsubscribe ack ->", err);
      }
      return;
    }

    // ACCOUNT identify
    if (data.type === "identify" && data.accountId) {
      if (!clientWs.routes.has("account")) {
        try {
          clientWs.send(JSON.stringify({ status: "error", error: "join account route first" }));
        } catch {}
        return;
      }

      const accountId = String(data.accountId);
      clientWs.accountId = accountId;

      // register in accountIdMap
      ensureAccountSet(accountId);
      accountIdMap.get(accountId).add(clientWs.clientId);

      try {
        clientWs.send(JSON.stringify({ status: "identified", accountId: clientWs.accountId }));
      } catch (err) {
        console.error("[WS SEND ERROR] identify ack ->", err);
      }
      return;
    }

  } catch (err) {
    console.error("[WS CLIENT] Invalid message", err);
    try {
      clientWs.send(JSON.stringify({ status: "error", error: "Invalid JSON" }));
    } catch {}
  }
}
