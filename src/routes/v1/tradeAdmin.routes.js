import { Router } from "express";
import {
  adminCancelPendingOrder,
  adminClosePosition,
  adminListBrokerage,
  adminListClosedTrades,
  adminListPendingOrdersHistory,
  adminModifyPendingOrder,
  adminModifyPosition,
  adminPlaceMarketOrder,
  adminPlacePendingOrder,
  getTradeAdminSummary,
} from "../../controllers/tradeAdmin.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = Router();

// GET /api/v1/trade-admin/summary
router.get("/summary", authMiddleware, adminAuth, getTradeAdminSummary);
// GET /api/v1/trade-admin/brokerage
router.get("/brokerage", authMiddleware, adminAuth, adminListBrokerage);
// GET /api/v1/trade-admin/trades/closed
router.get("/trades/closed", authMiddleware, adminAuth, adminListClosedTrades);
// GET /api/v1/trade-admin/orders/pending/history
router.get(
  "/orders/pending/history",
  authMiddleware,
  adminAuth,
  adminListPendingOrdersHistory,
);

// Backward-compatible aliases
router.get("/trade/closed", authMiddleware, adminAuth, adminListClosedTrades);
router.get(
  "/trade/pending/history",
  authMiddleware,
  adminAuth,
  adminListPendingOrdersHistory,
);

/* =========================
   ADMIN: TRADE ON BEHALF
========================= */
router.post("/trade/market", authMiddleware, adminAuth, adminPlaceMarketOrder);
router.post("/trade/pending", authMiddleware, adminAuth, adminPlacePendingOrder);
router.patch(
  "/trade/pending/modify",
  authMiddleware,
  adminAuth,
  adminModifyPendingOrder,
);
router.post(
  "/trade/pending/cancel",
  authMiddleware,
  adminAuth,
  adminCancelPendingOrder,
);
router.patch(
  "/trade/position/modify",
  authMiddleware,
  adminAuth,
  adminModifyPosition,
);
router.post("/trade/position/close", authMiddleware, adminAuth, adminClosePosition);

export default router;
