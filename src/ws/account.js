import { WebSocketServer } from "ws";
import { tradeEngine } from "../trade-engine/bootstrap.js";

export function attachAccountWS(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/account",
  });

  console.log("[WS] Account WebSocket attached at /ws/account");

  wss.on("connection", (ws) => {
    console.log("[ACCOUNT WS] client connected");

    let accountId = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "subscribe_account") {
          accountId = msg.accountId;

          const acc = tradeEngine.accounts.get(accountId);
          if (!acc) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Account not found",
              })
            );
            return;
          }

          // initial snapshot
          ws.send(
            JSON.stringify({
              type: "live_account",
              data: {
                accountId: acc.accountId,
                balance: acc.balance,
                equity: acc.equity,
                usedMargin: acc.usedMargin,
                freeMargin: acc.freeMargin,
              },
            })
          );
        }
      } catch (e) {
        console.error("[ACCOUNT WS] invalid message", e);
      }
    });
  });
}
