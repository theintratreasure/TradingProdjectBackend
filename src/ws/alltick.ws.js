// ws/alltick.manager.js
// Full file with aggressive, actionable debug to determine exactly why spread isn't applied.
// Logs are throttled to avoid console spam but by default are very verbose.
// Set env:
//   ALLTICK_DEBUG=1      -> verbose per-client logs (helpful during troubleshooting)
//   ALLTICK_DEBUG_THROTTLE_MS=1000 -> throttle per-symbol summary (ms)
// Keep this single file; paste over your existing file.

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

// Debug flags
const DBG_VERBOSE = String(process.env.ALLTICK_DEBUG || "0") === "1" || String(process.env.ALLTICK_DEBUG || "0") === "true";
const LOG_THROTTLE_MS = Number(process.env.ALLTICK_DEBUG_THROTTLE_MS || 1500);

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

const normalizeMarket = (v) =>
  String(v || "")
    .trim()
    .toLowerCase();
const normalizeSymbol = (v) =>
  String(v || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
const makeKey = (market, symbol) =>
  `${normalizeMarket(market)}:${normalizeSymbol(symbol)}`;

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// Lightweight DBG functions controlled by env
function DBG(...args) {
  if (DBG_VERBOSE) console.debug("[ALLTICK-MGR][DBG]", ...args);
}
function INFO(...args) {
  console.info("[ALLTICK-MGR]", ...args);
}
function WARN(...args) {
  console.warn("[ALLTICK-MGR]", ...args);
}
function ERROR(...args) {
  console.error("[ALLTICK-MGR]", ...args);
}

// throttled per-symbol summary logging (prevents flood but gives clear status)
const lastTickLog = new Map(); // symbol -> timestamp
function shouldLogForSymbol(symbol) {
  try {
    const last = lastTickLog.get(symbol) || 0;
    const now = Date.now();
    if (now - last > LOG_THROTTLE_MS) {
      lastTickLog.set(symbol, now);
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

// per-client per-symbol small throttle for very verbose logs
const clientSymbolLogTs = new Map(); // `${clientId}:${symbol}` -> timestamp
function shouldLogClientSymbol(clientId, symbol) {
  try {
    const key = `${clientId}:${symbol}`;
    const last = clientSymbolLogTs.get(key) || 0;
    const now = Date.now();
    if (now - last > LOG_THROTTLE_MS) {
      clientSymbolLogTs.set(key, now);
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

// rounding helpers: bids should not round up, asks should not round down
function applyTickAndPrecision(value, tick, prec, isBid) {
  if (typeof value !== "number" || Number.isNaN(value)) return value;
  let v = value;
  if (tick > 0) {
    if (isBid) v = Math.floor(v / tick) * tick; // bids down
    else v = Math.ceil(v / tick) * tick; // asks up
  }
  if (typeof prec === "number") v = Number(v.toFixed(prec));
  return v;
}

// find symbol in engine with loose matching (case / key normalization)
function findSymbolInEngine(symbol) {
  try {
    if (!tradeEngine || !tradeEngine.symbols) return null;
    if (tradeEngine.symbols.has(symbol)) return tradeEngine.symbols.get(symbol);
    for (const [k, v] of tradeEngine.symbols.entries()) {
      if (normalizeSymbol(k) === symbol) return v;
    }
  } catch (err) {
    DBG("findSymbolInEngine error", err && err.message ? err.message : err);
  }
  return null;
}

// attempt to load account into engine memory (subscribe-time)
// only works if tradeEngine exposes loadAccount(accountId) async function
async function ensureEngineAccount(accountId) {
  if (!accountId || !tradeEngine) return null;
  let acc = tradeEngine.accounts && tradeEngine.accounts.get(accountId);
  if (acc) return acc;
  if (typeof tradeEngine.loadAccount === "function") {
    try {
      acc = await tradeEngine.loadAccount(accountId);
      INFO("ensureEngineAccount: loaded account into engine", accountId, !!acc ? "OK" : "FAILED");
      return acc;
    } catch (err) {
      DBG("ensureEngineAccount loadAccount threw", err && err.message ? err.message : err);
      return null;
    }
  }
  return null;
}

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
      ERROR(`[${this.marketName}] ALLTICK_API_KEY missing`);
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

    INFO(`[${this.marketName}] Connecting to AllTick...`);

    this.client = new WebSocket(this.url, { handshakeTimeout: 10000 });

    this.client.on("open", () => {
      this.connected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      INFO(`[${this.marketName}] Connected to AllTick WS`);
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
        ERROR(`[${this.marketName}] Invalid JSON`, err && err.message ? err.message : err);
      }
    });

    this.client.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "";
      WARN(`[${this.marketName}] WS Closed`, code, reasonStr);
      this.cleanupAndReconnect(code, reasonStr);
    });

    this.client.on("error", (err) => {
      ERROR(`[${this.marketName}] WS Error`, err && err.message ? err.message : err);
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
      INFO(`[${this.marketName}] manual close, not reconnecting`);
      return;
    }

    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(5000 * this.reconnectAttempts, 60000);

    INFO(`[${this.marketName}] Reconnecting in ${delay}ms`);

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
        ERROR(`[${this.marketName}] Heartbeat send failed`, err && err.message ? err.message : err);
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
      ERROR(`[${this.marketName}] pushSubscription send failed`, err && err.message ? err.message : err);
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
  if (!clientSubscriptions.has(clientId))
    clientSubscriptions.set(clientId, new Set());
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
  if (ws.engineAccount) {
    ws.engineAccount = null;
  }
  clientSubscriptions.delete(id);
  wsClients.delete(id);
  DBG("Disconnected client", id);
}

// ========================
// BROADCAST ORDERBOOK (market route only)
// - Applies per-account+per-symbol spread/tick/precision only for those
//   clients who are identified (or provided accountId via subscribe) and have spread_enabled != false.
// - Others receive raw AllTick data.
// Detailed debug reasons are logged for any client that didn't get spread.
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

  const bestBidRaw = data?.bids?.[0]?.price;
  const bestAskRaw = data?.asks?.[0]?.price;

  const bestBid = safeNum(bestBidRaw);
  const bestAsk = safeNum(bestAskRaw);

  DBG("broadcast orderbook ->", market, symbol, "clients:", wsClients.size);

  let appliedCount = 0;
  let rawCount = 0;

  // iterate clients and send either raw or adjusted per-account feed
  for (const [id, ws] of wsClients.entries()) {
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (!ws.routes || !ws.routes.has("market")) continue;
    const subs = clientSubscriptions.get(id);
    if (!subs || !subs.has(key)) continue;

    try {
      // default: raw data (clone so we don't mutate original)
      let out = JSON.parse(JSON.stringify(data));

      // If client provided accountId via subscribe or identify earlier,
      // then adjust top-of-book prices per account+symbol rules.
      const acc = ws.engineAccount || null;

      // background lazy load: try to load if accountId present but engineAccount missing
      if (!acc && ws.accountId && typeof tradeEngine?.loadAccount === "function") {
        // don't await here, load in background and it will affect future ticks
        tradeEngine.loadAccount(ws.accountId).then((loaded) => {
          if (loaded) {
            DBG("lazy-loaded account for client", id, ws.accountId);
            ws.engineAccount = loaded;
          }
        }).catch(() => {});
      }

      let appliedThisClient = false;
      let skipReason = null;

      if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) {
        skipReason = { reason: "bad_prices", bestBidRaw, bestAskRaw };
      } else if (!acc) {
        skipReason = { reason: "no_account_attached", clientId: id, accountId: ws.accountId || null };
      } else if (acc.spread_enabled === false) {
        skipReason = { reason: "spread_disabled_on_account", accountId: ws.accountId };
      } else {
        // try to fetch symbol object from engine
        const sym = findSymbolInEngine(symbol);
        if (!sym) {
          skipReason = { reason: "symbol_missing_in_engine", symbol, engineSymbolCount: tradeEngine.symbols?.size ?? 0 };
        } else {
          // try engine.formatPrice (if exists)
          let formatted = null;
          if (typeof tradeEngine.formatPrice === "function") {
            try {
              const maybe = tradeEngine.formatPrice(acc, sym, bestBid, bestAsk);
              if (maybe && typeof maybe.bid === "number" && typeof maybe.ask === "number" && Number.isFinite(maybe.bid) && Number.isFinite(maybe.ask)) {
                formatted = { bid: maybe.bid, ask: maybe.ask, src: "engine.formatPrice" };
              } else {
                DBG("formatPrice returned invalid structure", symbol, maybe);
              }
            } catch (err) {
              DBG("formatPrice threw", symbol, err && err.message ? err.message : err);
            }
          }

          // fallback simple formatting
          if (!formatted) {
            const spread = typeof sym.spread === "number" ? sym.spread : 0;
            const tick = typeof sym.tickSize === "number" ? sym.tickSize : 0;
            const prec = typeof sym.pricePrecision === "number" ? sym.pricePrecision : undefined;

            let pbid = bestBid;
            let pask = bestAsk;

            if (spread > 0) {
              const half = spread / 2;
              pbid = pbid - half;
              pask = pask + half;
            }

            // enforce tick & precision: bid down, ask up
            pbid = applyTickAndPrecision(pbid, tick, prec, true);
            pask = applyTickAndPrecision(pask, tick, prec, false);

            formatted = { bid: pbid, ask: pask, src: "fallback" };
          }

          // finally validate formatted
          if (
            formatted &&
            typeof formatted.bid === "number" &&
            typeof formatted.ask === "number" &&
            Number.isFinite(formatted.bid) &&
            Number.isFinite(formatted.ask)
          ) {
            // replace top-of-book in out clone
            if (out.bids && out.bids[0]) out.bids[0].price = formatted.bid;
            if (out.asks && out.asks[0]) out.asks[0].price = formatted.ask;
            appliedThisClient = true;
            // verbose per-client log if enabled
            if (DBG_VERBOSE && shouldLogClientSymbol(id, symbol)) {
              INFO(`client ${id} -> spread applied for ${symbol} (account=${ws.accountId}) src=${formatted.src} bid:${bestBidRaw}→${formatted.bid} ask:${bestAskRaw}→${formatted.ask}`);
            }
          } else {
            skipReason = { reason: "formatted_invalid", symbol, formatted };
          }
        }
      }

      // send message
      const msg = JSON.stringify({ type: "orderbook", market, data: out });
      ws.send(msg);

      if (appliedThisClient) appliedCount++;
      else {
        rawCount++;
        // If verbose mode on, log reason for not applying (throttled)
        if (DBG_VERBOSE && shouldLogClientSymbol(id, symbol)) {
          INFO(`client ${id} -> spread NOT applied for ${symbol}`, skipReason || { reason: "unknown" });
        }
      }
    } catch (err) {
      ERROR("[WS SEND ERROR] orderbook ->", err && err.message ? err.message : err);
    }
  } // end clients loop

  // summary log (throttled)
  if (shouldLogForSymbol(symbol)) {
    INFO(`tick ${symbol} feed -> bestBid=${bestBidRaw} bestAsk=${bestAskRaw} applied=${appliedCount} raw=${rawCount} engineSymbols=${tradeEngine.symbols?.size ?? 0} engineAccounts=${tradeEngine.accounts?.size ?? 0}`);
    // If appliedCount === 0, provide extra hints immediately (helpful root-cause)
    if (appliedCount === 0) {
      // Common reasons: symbol missing, accounts missing, spread disabled, bad prices
      const symExists = !!findSymbolInEngine(symbol);
      INFO("tick analysis hint:", {
        symbol,
        symExists,
        symLoaded: symExists ? "yes" : "no",
        accountCount: tradeEngine.accounts?.size ?? 0,
        recommend: symExists ? "check account.spread_enabled or formatPrice" : "load symbols into tradeEngine at bootstrap (tradeEngine.symbols)"
      });
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

  const bid = safeNum(bestBid);
  const ask = safeNum(bestAsk);

  DBG("onTick feed ->", symbol, "bid", bid, "ask", ask);

  try {
    if (typeof tradeEngine.onTick === "function") {
      tradeEngine.onTick(symbol, bid, ask);
    } else {
      DBG("tradeEngine.onTick missing");
    }
  } catch (err) {
    ERROR("[ENGINE] onTick error", err && err.message ? err.message : err);
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
    DBG("[ALLTICK-MGR][REDIS] publish error", err && err.message ? err.message : err);
  });
}

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
      ERROR(`[ENGINE] publish ${ev} error`, err && err.message ? err.message : err);
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
    ERROR("[ALLTICK-MGR][REDIS] invalid message", err && err.message ? err.message : err);
    return;
  }

  const { eventType, payload } = obj;
  if (!eventType || !payload) return;

  DBG("redisSub message ->", eventType, payload?.accountId ?? payload?.orderId ?? null);

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
        ERROR("[WS SEND ERROR] live_account ->", err && err.message ? err.message : err);
      }
    }
    DBG(`forwarded live_account to ${sent}/${s.size} clients for account ${payload.accountId}`);
    return;
  }

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
        ERROR("[WS SEND ERROR] live_position ->", err && err.message ? err.message : err);
      }
    }
    DBG(`forwarded live_position to ${sent}/${s.size} clients for account ${payload.accountId}`);
    return;
  }

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
        ERROR("[WS SEND ERROR]", type, "->", err && err.message ? err.message : err);
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

    // MARKET subscribe (supports inline accountId)
    if (data.type === "subscribe") {
      const market = normalizeMarket(data.market);
      const symbol = normalizeSymbol(data.symbol);

      if (!market || !symbol) {
        try {
          clientWs.send(JSON.stringify({ status: "error", error: "invalid market or symbol" }));
        } catch {}
        return;
      }

      // ensure client is registered for market route (auto-join)
      if (!clientWs.routes || !clientWs.routes.has("market")) {
        clientWs.routes = clientWs.routes || new Set();
        clientWs.routes.add("market");
      }

      // attach account directly if provided in subscribe payload
      if (data.accountId) {
        const accountId = String(data.accountId);
        clientWs.accountId = accountId;

        // try to resolve engine account now (await if loader available)
        let acc = tradeEngine.accounts && tradeEngine.accounts.get(accountId);
        if (!acc && typeof tradeEngine?.loadAccount === "function") {
          try {
            acc = await ensureEngineAccount(accountId);
          } catch {}
        }
        clientWs.engineAccount = acc || null;

        ensureAccountSet(accountId);
        accountIdMap.get(accountId).add(clientWs.clientId);

        INFO(`client ${clientWs.clientId} subscribed with account ${accountId} engineAccount=${clientWs.engineAccount ? "loaded" : "missing"}`);
      }

      const key = makeKey(market, symbol);
      subs.add(key);

      if (market === "crypto") wsCrypto.subscribe(symbol);
      if (market === "stock") wsStock.subscribe(symbol);

      // fetch day high/low (best-effort)
      let hl = null;
      try {
        hl = await HighLowService.getDayHighLow(market, symbol);
      } catch (err) {
        DBG("HighLowService failed", err && err.message ? err.message : err);
      }

      try {
        clientWs.send(
          JSON.stringify({
            status: "subscribed",
            symbol,
            accountId: clientWs.accountId || null,
            dayOpen: hl?.data?.open ?? null,
            dayHigh: hl?.data?.high ?? null,
            dayLow: hl?.data?.low ?? null,
            dayClose: hl?.data?.close ?? null,
          }),
        );
      } catch (err) {
        ERROR("[WS SEND ERROR] subscribe ack ->", err && err.message ? err.message : err);
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
        ERROR("[WS SEND ERROR] unsubscribe ack ->", err && err.message ? err.message : err);
      }
      return;
    }

    // ACCOUNT identify -> register + snapshot pending orders + positions + account
    if (data.type === "identify" && data.accountId) {
      if (!clientWs.routes.has("account")) {
        clientWs.routes.add("account");
      }

      const accountId = String(data.accountId);
      clientWs.accountId = accountId;

      // set engine account reference (try load if missing)
      let acc = tradeEngine.accounts && tradeEngine.accounts.get(accountId);
      if (!acc && typeof tradeEngine?.loadAccount === "function") {
        try {
          acc = await ensureEngineAccount(accountId);
        } catch {}
      }
      clientWs.engineAccount = acc || null;

      ensureAccountSet(accountId);
      accountIdMap.get(accountId).add(clientWs.clientId);

      DBG("client identified", clientWs.clientId, "accountId", accountId, "subscribers:", accountIdMap.get(accountId).size);

      try {
        clientWs.send(JSON.stringify({ status: "identified", accountId: clientWs.accountId, engineAccount: clientWs.engineAccount ? "loaded" : "missing" }));
      } catch (err) {
        ERROR("[WS SEND ERROR] identify ack ->", err && err.message ? err.message : err);
      }

      // pendingOrders snapshot
      try {
        const account = tradeEngine.accounts.get(accountId);
        if (account?.pendingOrders && account.pendingOrders.size > 0) {
          DBG("sending pendingOrders snapshot", account.pendingOrders.size, "to", clientWs.clientId);
          for (const order of account.pendingOrders.values()) {
            try {
              clientWs.send(JSON.stringify({ type: "live_pending", data: order }));
            } catch (err) {
              ERROR("[WS SEND ERROR] live_pending snapshot ->", err && err.message ? err.message : err);
            }
          }
        } else {
          DBG("no pendingOrders to snapshot for", accountId);
        }
      } catch {}

      // positions snapshot (applies spread when possible)
      try {
        const account = tradeEngine.accounts.get(accountId);
        if (account?.positions && account.positions.size > 0) {
          DBG("sending positions snapshot", account.positions.size, "to", clientWs.clientId);
          for (const pos of account.positions.values()) {
            try {
              let currentPriceToSend = pos.openPrice;
              try {
                const sym = findSymbolInEngine(pos.symbol);
                if (clientWs.engineAccount && clientWs.engineAccount.spread_enabled !== false && sym) {
                  const latestBid = Number(sym.bid || sym.rawBid || 0) || pos.openPrice;
                  const latestAsk = Number(sym.ask || sym.rawAsk || 0) || pos.openPrice;
                  const spread = typeof sym.spread === "number" ? sym.spread : 0;
                  const tick = typeof sym.tickSize === "number" ? sym.tickSize : 0;
                  const prec = typeof sym.pricePrecision === "number" ? sym.pricePrecision : undefined;

                  let pbid = latestBid;
                  let pask = latestAsk;

                  if (spread > 0) {
                    const half = spread / 2;
                    pbid = pbid - half;
                    pask = pask + half;
                  }
                  pbid = applyTickAndPrecision(pbid, tick, prec, true);
                  pask = applyTickAndPrecision(pask, tick, prec, false);

                  currentPriceToSend = pos.side === "BUY" ? pask : pbid;
                } else {
                  currentPriceToSend = pos.openPrice;
                }
              } catch {
                currentPriceToSend = pos.openPrice;
              }

              const payload = {
                accountId,
                positionId: pos.positionId,
                volume: pos.volume,
                openTime: pos.openTime || Date.now(),
                symbol: pos.symbol,
                side: pos.side,
                openPrice: pos.openPrice,
                currentPrice: currentPriceToSend,
                floatingPnL: Number((pos.floatingPnL || 0).toFixed(2)),
                stopLoss: pos.stopLoss ?? null,
                takeProfit: pos.takeProfit ?? null,
                commission: pos.commission || 0,
                swapPerDay: pos.swapPerDay || 0,
              };
              clientWs.send(JSON.stringify({ type: "live_position", data: payload }));
            } catch (err) {
              ERROR("[WS SEND ERROR] live_position snapshot ->", err && err.message ? err.message : err);
            }
          }
        } else {
          DBG("no positions to snapshot for", accountId);
        }
      } catch {}

      // account snapshot
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
        ERROR("[ALLTICK-MGR] error sending account snapshot", err && err.message ? err.message : err);
      }

      return;
    }
  } catch (err) {
    ERROR("[WS CLIENT] Invalid message", err && err.message ? err.message : err);
    try {
      clientWs.send(JSON.stringify({ status: "error", error: "Invalid JSON" }));
    } catch {}
  }
}

// ========================
// end of file
// ========================
