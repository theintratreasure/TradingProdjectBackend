import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import redisClient from '../config/redis.js';

/* =========================
   CONFIG
========================= */

const ALLTICK_WS_URL =
  'wss://quote.alltick.co/quote-b-ws-api?token=08300b59b2eeabe35d564f60e06f45f9-c-app';

/* =========================
   IN-MEMORY STATE
========================= */

// client ws -> Set(symbols)
const clientSubscriptions = new Map();

// symbol -> Set(client ws)
const symbolSockets = new Map();

/* =========================
   ALLTICK FEED
========================= */

function connectAllTickFeed() {
  const feed = new WebSocket(ALLTICK_WS_URL, {
    perMessageDeflate: false
  });

  feed.on('open', () => {
    const subscribePayload = {
      cmd_id: 22002, // ✅ correct subscribe command
      seq_id: Date.now(),
      data: {
        symbol_list: [
          { code: 'BTCUSDT', depth_level: 5 },
          { code: 'ETHUSDT', depth_level: 5 }
        ]
      }
    };

    feed.send(JSON.stringify(subscribePayload));
  });

  feed.on('message', async buffer => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return;
    }

    // ✅ ONLY LIVE TICKS FROM ALLTICK
    if (message.cmd_id !== 22999) return;
    if (!message.data || !message.data.code) return;

    const symbol = String(message.data.code).toUpperCase();
    const bids = message.data.bids;
    const asks = message.data.asks;

    if (!bids || bids.length === 0) return;

    const tick = {
      symbol,
      bid: Number(bids[0].price),
      ask: asks && asks.length > 0 ? Number(asks[0].price) : null,
      ts: Number(message.data.tick_time)
    };

    // Store snapshot
    await redisClient.set(`TICK:${symbol}`, JSON.stringify(tick));

    // Push to subscribed clients
    const subscribers = symbolSockets.get(symbol);
    if (!subscribers) return;

    const payload = JSON.stringify(tick);
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  });

  feed.on('close', () => {
    setTimeout(connectAllTickFeed, 2000);
  });

  feed.on('error', () => {
    feed.close();
  });
}

/* =========================
   CLIENT WEBSOCKET SERVER
========================= */

export default function startMarketWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // AUTH
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close();
      return;
    }

    clientSubscriptions.set(ws, new Set());

    ws.on('message', async buffer => {
      let msg;
      try {
        msg = JSON.parse(buffer.toString());
      } catch {
        return;
      }

      // SUBSCRIBE
      if (msg.type === 'SUBSCRIBE' && Array.isArray(msg.symbols)) {
        for (const rawSymbol of msg.symbols) {
          const symbol = String(rawSymbol).toUpperCase();

          clientSubscriptions.get(ws).add(symbol);

          if (!symbolSockets.has(symbol)) {
            symbolSockets.set(symbol, new Set());
          }
          symbolSockets.get(symbol).add(ws);

          // Send last snapshot instantly
          const snapshot = await redisClient.get(`TICK:${symbol}`);
          if (snapshot) {
            ws.send(snapshot);
          }
        }
      }

      // UNSUBSCRIBE
      if (msg.type === 'UNSUBSCRIBE' && typeof msg.symbol === 'string') {
        const symbol = String(msg.symbol).toUpperCase();
        clientSubscriptions.get(ws)?.delete(symbol);
        symbolSockets.get(symbol)?.delete(ws);
      }
    });

    ws.on('close', () => {
      const symbols = clientSubscriptions.get(ws);
      if (symbols) {
        for (const symbol of symbols) {
          symbolSockets.get(symbol)?.delete(ws);
        }
      }
      clientSubscriptions.delete(ws);
    });
  });

  // Start AllTick feed once
  connectAllTickFeed();
}
