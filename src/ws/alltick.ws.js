// src/ws/alltick.ws.js
import WebSocket from "ws";
import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { HighLowService } from "../services/highlow.service.js";
import { tradeEngine } from "../trade-engine/bootstrap.js";

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
const buildTrace = () => `${uuidv4()}-${nowTs()}`;

const normalizeMarket = (v) => String(v || "").trim().toLowerCase();

/**
 * Engine symbols: GBPUSD, BTCUSD
 * AllTick symbols: GBP_USD / GBP/USD / FX_GBPUSD
 */
const normalizeSymbol = (v) =>
  String(v || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

const makeKey = (market, symbol) =>
  `${normalizeMarket(market)}:${normalizeSymbol(symbol)}`;

// ========================
// AllTick WebSocket Manager
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

    if (this.isConnecting) return;
    this.isConnecting = true;

    if (this.client) {
      try {
        this.client.terminate();
      } catch {}
    }

    console.log(`[${this.marketName}] Connecting to AllTick...`);

    this.client = new WebSocket(this.url, { handshakeTimeout: 10000 });

    this.client.on("open", () => {
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();

      console.log(`[${this.marketName}] ✅ Connected to AllTick WS`);
      this.emit("ready");
      this.startHeartbeat();
      this.restoreSubscriptions();
    });

    this.client.on("message", (raw) => {
      try {
        const json = JSON.parse(raw.toString());

        if (json.cmd_id === 22003) {
          console.log(`[${this.marketName}] ✅ Subscription confirmed`);
          this.emit("subscribed", json);
          return;
        }

        if (json.cmd_id === 22999 && json.data) {
          // 🔥 RAW MARKET DATA
          // console.log(`[${this.marketName}] 📈 TICK RECEIVED`, json.data);
          this.emit("data", json.data);
        }
      } catch (err) {
        console.error(`[${this.marketName}] ❌ Invalid JSON`, err);
      }
    });

    this.client.on("pong", () => {
      this.lastPongAt = Date.now();
    });

    this.client.on("close", () => {
      console.warn(`[${this.marketName}] ❌ WS Closed`);
      this.connected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.client.on("error", (err) => {
      console.error(`[${this.marketName}] ❌ WS Error`, err);
      this.connected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(2000 * 2 ** (this.reconnectAttempts - 1), 30000);

    console.log(
      `[${this.marketName}] 🔄 Reconnecting in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (!this.connected || !this.client) return;

      const diff = Date.now() - this.lastPongAt;
      if (diff > 45000) {
        console.warn(`[${this.marketName}] ⚠ Pong timeout`);
        try {
          this.client.terminate();
        } catch {}
      } else {
        try {
          this.client.ping();
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

  subscribe(codeRaw, levelRaw = 5) {
    const code = normalizeSymbol(codeRaw);
    const depth = Number(levelRaw) || 5;

    if (!code) return;

    console.log(`[${this.marketName}] ➕ Subscribing`, code);

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

    console.log(
      `[${this.marketName}] 📤 Sending subscription`,
      symbolList
    );

    const payload = {
      cmd_id: 22002,
      seq_id: this.nextSeqId(),
      trace: buildTrace(),
      data: { symbol_list: symbolList },
    };

    try {
      this.client.send(JSON.stringify(payload));
    } catch {}
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

wsCrypto.connect();
wsStock.connect();

// ========================
// CLIENT REGISTRY
// ========================
export const wsClients = new Map();
const clientSubscriptions = new Map();

export function registerClient(client) {
  const id = uuidv4();
  client.clientId = id;
  wsClients.set(id, client);
  clientSubscriptions.set(id, new Set());
  console.log("[WS CLIENT] Connected:", id);
  return id;
}

export function removeClient(id) {
  wsClients.delete(id);
  clientSubscriptions.delete(id);
  console.log("[WS CLIENT] Disconnected:", id);
}

// ========================
// BROADCAST TO FRONTEND
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
    if (ws.readyState !== WebSocket.OPEN) continue;
    const subs = clientSubscriptions.get(id);
    if (!subs || !subs.has(key)) continue;

    ws.send(msg);
  }
}

// ========================
// 🔥 FEED PRICE TO TRADE ENGINE (WITH DEBUG)
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

  // ✅ orderbook format handling
  const bestBid = data?.bids?.[0]?.price;
  const bestAsk = data?.asks?.[0]?.price;

  const bid = Number(bestBid);
  const ask = Number(bestAsk);

  // ⚠️ crypto feeds often send only bids or only asks
  // if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
  //   console.warn("[ENGINE FEED SKIPPED]", {
  //     symbol,
  //     bid,
  //     ask,
  //     reason: "ORDERBOOK_INCOMPLETE",
  //   });
    // return;
  // }

  // console.log(
  //   "[ENGINE FEED] ✅ Price sent to engine",
  //   symbol,
  //   bid,
  //   ask
  // );

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
// CLIENT MESSAGE HANDLER
// ========================
export async function handleClientMessage(clientWs, msg) {
  try {
    const data = JSON.parse(msg);
    const subs = clientSubscriptions.get(clientWs.clientId);
    if (!subs) return;

    const market = normalizeMarket(data.market);
    const symbol = normalizeSymbol(data.symbol);
    const key = makeKey(market, symbol);

    if (data.type === "subscribe") {
      subs.add(key);

      console.log("[WS CLIENT] 📡 Subscribe", market, symbol);

      if (market === "crypto") wsCrypto.subscribe(symbol);
      if (market === "stock") wsStock.subscribe(symbol);

      const hl = await HighLowService.getDayHighLow(market, symbol);

      clientWs.send(
        JSON.stringify({
          status: "subscribed",
          symbol,
          dayHigh: hl?.data?.high ?? null,
          dayLow: hl?.data?.low ?? null,
        })
      );
      return;
    }

    if (data.type === "unsubscribe") {
      subs.delete(key);
      clientWs.send(JSON.stringify({ status: "unsubscribed", symbol }));
    }
  } catch (err) {
    console.error("[WS CLIENT] ❌ Invalid message", err);
    clientWs.send(JSON.stringify({ status: "error", error: "Invalid JSON" }));
  }
}
