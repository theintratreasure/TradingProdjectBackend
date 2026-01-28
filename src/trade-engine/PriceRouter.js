// src/trade-engine/PriceRouter.js
export class PriceRouter {
  constructor(engine) {
    this.engine = engine;
  }

  onTick(symbol, bid, ask) {
    this.engine.onTick(symbol, bid, ask);
  }
}
