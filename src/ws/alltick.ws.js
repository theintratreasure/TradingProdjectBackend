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
  if (err) console.error("[ALLTICK-MGR][REDIS] subscribe error", err);
  else console.log("[ALLTICK-MGR] subscribed to", REDIS_CHANNEL);
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

const DBG = (...args) => {
  try {
    console.debug.apply(console, ["[ALLTICK-MGR]", ...args]);
  } catch {}
};

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

    if (this.connected || this.isConnecting) return;
    this.isConnecting = true;
    this.manualClose = false;

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
          return;
        }

        if (json.cmd_id === 22998) {
          this.emit("heartbeat_ack", json);
          return;
        }

        this.emit("raw", json);
      } catch (err) {
        console.error(`[${this.marketName}] Invalid JSON`, err);
      }
    });

    this.client.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "";
      console.warn(`[${this.marketName}] WS Closed`, code, reasonStr);
      this.cleanupAndReconnect(code, reasonStr);
    });

    this.client.on("error", (err) => {
      console.error(`[${this.marketName}] WS Error`, err && err.message ? err.message : err);
      this.cleanupAndReconnect();
    });
  }

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

    if (this.manualClose) {
      console.log(`[${this.marketName}] manual close, not reconnecting`);
      return;
    }

    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(5000 * this.reconnectAttempts, 60000);

    console.log(`[${this.marketName}] Reconnecting in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.connected || this.isConnecting) return;
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      if (!this.connected || !this.client) return;

      const payload = {
        cmd_id: 22998,
        seq_id: this.nextSeqId(),
        trace: buildTrace(),
      };

      try {
        this.client.send(JSON.stringify(payload));
      } catch (err) {
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
  ensureClientSubs(id);
  DBG("Connected client", id);
  return id;
}

// remove client and cleanup maps
export function removeClient(id) {
  const ws = wsClients.get(id);
  if (!ws) return;
  if (ws.accountId) {
    const set = accountIdMap.get(ws.accountId);
    if (set) {
      set.delete(id);
      DBG("removed client from account map", ws.accountId, "remaining:", set.size);
      if (set.size === 0) accountIdMap.delete(ws.accountId);
    }
  }
  clientSubscriptions.delete(id);
  wsClients.delete(id);
  DBG("Disconnected client", id);
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

  DBG("broadcast orderbook ->", market, symbol, "clients:", Array.from(wsClients.keys()).length);

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
  // do not strip stable suffixes here; keep same format engine expects (e.g. BTCUSDT)
  const symbol = normalized.startsWith("FX")
    ? normalized.replace(/^FX/, "")
    : normalized;

  const bestBid = data?.bids?.[0]?.price;
  const bestAsk = data?.asks?.[0]?.price;

  const bid = Number(bestBid);
  const ask = Number(bestAsk);

  DBG("onTick feed ->", symbol, "bid", bid, "ask", ask);

  try {
    tradeEngine.onTick(symbol, bid, ask);
  } catch (err) {
    console.error("[ENGINE] onTick error", err);
  }
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
    console.error("[ALLTICK-MGR][REDIS] publish error", err);
  });
}

// publish ALL relevant engineEvents so other workers get them
const forwardableEvents = [
  "LIVE_ACCOUNT",
  "LIVE_POSITION",
  "LIVE_PENDING",
  "LIVE_PENDING_EXECUTE",
  "LIVE_PENDING_CANCEL",
  "LIVE_PENDING_EXECUTE_FAILED",
  "LIVE_PENDING_MODIFY",
];

forwardableEvents.forEach((ev) => {
  engineEvents.on(ev, (payload) => {
    try {
      DBG("engineEvents", ev, "->", payload?.accountId ?? payload?.orderId ?? "?");
      publishEngineEvent(ev, payload);
    } catch (err) {
      console.error(`[ENGINE] publish ${ev} error`, err);
    }
  });
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
    console.error("[ALLTICK-MGR][REDIS] invalid message", err);
    return;
  }

  const { eventType, payload } = obj;
  if (!eventType || !payload) return;

  DBG("redisSub message ->", eventType, payload?.accountId ?? payload?.orderId ?? null);

  // account update
  if (eventType === "LIVE_ACCOUNT") {
    const s = accountIdMap.get(String(payload.accountId));
    if (!s || s.size === 0) return;
    const msgStr = JSON.stringify({ type: "live_account", data: payload });
    let sent = 0;
    for (const clientId of s) {
      const ws = wsClients.get(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (!ws.routes || !ws.routes.has("account")) continue;
      try {
        ws.send(msgStr);
        sent++;
      } catch (err) {
        console.error("[WS SEND ERROR] live_account ->", err);
      }
    }
    DBG(`forwarded live_account to ${sent}/${s.size} clients for account ${payload.accountId}`);
    return;
  }

  // position update
  if (eventType === "LIVE_POSITION") {
    const s = accountIdMap.get(String(payload.accountId));
    if (!s || s.size === 0) return;
    const msgStr = JSON.stringify({ type: "live_position", data: payload });
    let sent = 0;
    for (const clientId of s) {
      const ws = wsClients.get(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (!ws.routes || !ws.routes.has("account")) continue;
      try {
        ws.send(msgStr);
        sent++;
      } catch (err) {
        console.error("[WS SEND ERROR] live_position ->", err);
      }
    }
    DBG(`forwarded live_position to ${sent}/${s.size} clients for account ${payload.accountId}`);
    return;
  }

  // pending events: new/modify snapshot, execute, cancel, execute_failed
  if (
    [
      "LIVE_PENDING",
      "LIVE_PENDING_EXECUTE",
      "LIVE_PENDING_CANCEL",
      "LIVE_PENDING_EXECUTE_FAILED",
      "LIVE_PENDING_MODIFY",
    ].includes(eventType)
  ) {
    const accountId = String(payload.accountId);
    const clients = accountIdMap.get(accountId);
    if (!clients || clients.size === 0) {
      DBG("no subscribers for pending event account", accountId);
      return;
    }

    // map engine event -> client message type
    const typeMap = {
      LIVE_PENDING: "live_pending",
      LIVE_PENDING_EXECUTE: "live_pending_execute",
      LIVE_PENDING_CANCEL: "live_pending_cancel",
      LIVE_PENDING_EXECUTE_FAILED: "live_pending_execute_failed",
      LIVE_PENDING_MODIFY: "live_pending_modify",
    };

    const type = typeMap[eventType] || "live_pending";

    const msgStr = JSON.stringify({ type, data: payload });
    let sent = 0;
    for (const clientId of clients) {
      const ws = wsClients.get(clientId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (!ws.routes || !ws.routes.has("account")) continue;
      try {
        ws.send(msgStr);
        sent++;
      } catch (err) {
        console.error("[WS SEND ERROR]", type, "->", err);
      }
    }
    DBG(`forwarded ${type} to ${sent}/${clients.size} clients for account ${accountId}`);
    return;
  }
});

// ========================
// CLIENT MESSAGE HANDLER
// ========================
export async function handleClientMessage(clientWs, msg) {
  try {
    const data = JSON.parse(msg);
    ensureClientSubs(clientWs.clientId);
    const subs = clientSubscriptions.get(clientWs.clientId);
    if (!subs) return;

    DBG("client message", clientWs.clientId, data.type || "<unknown>");

    // JOIN route (market/account)
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
            dayOpen: hl?.data?.open ?? null,
            dayHigh: hl?.data?.high ?? null,
            dayLow: hl?.data?.low ?? null,
            dayClose: hl?.data?.close ?? null,
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

    // ACCOUNT identify -> register + snapshot pending orders + positions + account
    if (data.type === "identify" && data.accountId) {
      // if client hasn't joined account route, add it automatically (keeps UX simple)
      if (!clientWs.routes.has("account")) {
        clientWs.routes.add("account");
      }

      const accountId = String(data.accountId);
      clientWs.accountId = accountId;

      // register in accountIdMap
      ensureAccountSet(accountId);
      accountIdMap.get(accountId).add(clientWs.clientId);

      DBG("client identified", clientWs.clientId, "accountId", accountId, "subscribers:", accountIdMap.get(accountId).size);

      // send ack
      try {
        clientWs.send(JSON.stringify({ status: "identified", accountId: clientWs.accountId }));
      } catch (err) {
        console.error("[WS SEND ERROR] identify ack ->", err);
      }

      // === 1) send pendingOrders snapshot (one-time) ===
      try {
        const account = tradeEngine.accounts.get(accountId);
        if (account?.pendingOrders && account.pendingOrders.size > 0) {
          DBG("sending pendingOrders snapshot", account.pendingOrders.size, "to", clientWs.clientId);
          for (const order of account.pendingOrders.values()) {
            try {
              clientWs.send(JSON.stringify({ type: "live_pending", data: order }));
            } catch (err) {
              console.error("[WS SEND ERROR] live_pending snapshot ->", err);
            }
          }
        } else {
          DBG("no pendingOrders to snapshot for", accountId);
        }
      } catch (err) {
        console.error("[ALLTICK-MGR] error sending pendingOrders snapshot", err);
      }

      // === 2) send positions snapshot (one-time) ===
      try {
        const account = tradeEngine.accounts.get(accountId);
        if (account?.positions && account.positions.size > 0) {
          DBG("sending positions snapshot", account.positions.size, "to", clientWs.clientId);
          for (const pos of account.positions.values()) {
            try {
              const payload = {
                accountId: accountId,
                positionId: pos.positionId,
                volume: pos.volume,
                openTime: pos.openTime || Date.now(),
                symbol: pos.symbol,
                side: pos.side,
                openPrice: pos.openPrice,
                currentPrice: pos.openPrice,
                floatingPnL: Number((pos.floatingPnL || 0).toFixed(2)),
                stopLoss: pos.stopLoss ?? null,
                takeProfit: pos.takeProfit ?? null,
              };
              clientWs.send(JSON.stringify({ type: "live_position", data: payload }));
            } catch (err) {
              console.error("[WS SEND ERROR] live_position snapshot ->", err);
            }
          }
        } else {
          DBG("no positions to snapshot for", accountId);
        }
      } catch (err) {
        console.error("[ALLTICK-MGR] error sending positions snapshot", err);
      }

      // === 3) send account snapshot (one-time) ===
      try {
        const account = tradeEngine.accounts.get(accountId);
        if (account) {
          const accPayload = {
            accountId,
            balance: Number(account.balance?.toFixed ? account.balance.toFixed(2) : account.balance),
            equity: Number(account.equity?.toFixed ? account.equity.toFixed(2) : account.equity),
            usedMargin: Number(account.usedMargin?.toFixed ? account.usedMargin.toFixed(2) : account.usedMargin),
            freeMargin: Number(account.freeMargin?.toFixed ? account.freeMargin.toFixed(2) : account.freeMargin),
          };
          clientWs.send(JSON.stringify({ type: "live_account", data: accPayload }));
          DBG("sent account snapshot to", clientWs.clientId, accPayload);
        } else {
          DBG("no account object found in tradeEngine for", accountId);
        }
      } catch (err) {
        console.error("[ALLTICK-MGR] error sending account snapshot", err);
      }

      // After snapshots, future pending/position/account events will be forwarded via redisSub handler

      return;
    }
  } catch (err) {
    console.error("[WS CLIENT] Invalid message", err);
    try {
      clientWs.send(JSON.stringify({ status: "error", error: "Invalid JSON" }));
    } catch {}
  }
}

// ========================
// end of file
// ========================
