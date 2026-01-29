import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
  placeMarketOrderController,
  placePendingOrderController,
  modifyPositionController,
  modifyPendingOrderController,
  closePosition,
  cancelPendingOrderController,
} from "../../controllers/trade.controller.js";

const router = Router();

/* =========================
   MARKET ORDERS
========================= */
// BUY MARKET / SELL MARKET
router.post("/market", authMiddleware, placeMarketOrderController);

/* =========================
   PENDING ORDERS
========================= */
// BUY LIMIT / SELL LIMIT / BUY STOP / SELL STOP
router.post("/pending", authMiddleware, placePendingOrderController);

// MODIFY PENDING ORDER (price / SL / TP)
router.patch("/pending/modify", authMiddleware, modifyPendingOrderController);

// CANCEL PENDING ORDER
router.post("/pending/cancel", authMiddleware, cancelPendingOrderController);

/* =========================
   OPEN POSITIONS
========================= */
// MODIFY SL / TP (open trade)
router.patch("/position/modify", authMiddleware, modifyPositionController);

// CLOSE TRADE (manual close)
router.post("/position/close", authMiddleware, closePosition);

export default router;
