import { engineEvents } from "./EngineEvents.js";

engineEvents.on("trade_open", (p) => {
  console.log("[ENGINE] TRADE OPEN", p.position.positionId);
});

engineEvents.on("trade_close", (p) => {
  console.log("[ENGINE] TRADE CLOSE", p.position.positionId);
});

engineEvents.on("ledger", (e) => {
  console.log("[LEDGER] EVENT:", e.event);
});
