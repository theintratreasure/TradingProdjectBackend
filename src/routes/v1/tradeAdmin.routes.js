import { Router } from "express";

// Import all admin trade controllers
import {
  adminCancelPendingOrder,
  adminClosePosition,
  adminListBrokerage,
  adminListClosedTrades,
  adminListOpenTrades,
  adminListPendingOrdersHistory,
  adminListPendingOrdersOpen,
  adminListUsersFunds,
  adminModifyPendingOrder,
  adminModifyPosition,
  adminPlaceMarketOrder,
  adminPlacePendingOrder,
  getTradeAdminSummary,
} from "../../controllers/tradeAdmin.controller.js";

// Import middlewares
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

// Create router instance
const router = Router();

/* ============================
   ADMIN DASHBOARD & REPORTS
============================ */

// Get overall trading summary
// GET /api/v1/trade-admin/summary
router.get("/summary", authMiddleware, adminAuth, getTradeAdminSummary);

// Get brokerage earnings
// GET /api/v1/trade-admin/brokerage
router.get("/brokerage", authMiddleware, adminAuth, adminListBrokerage);

// Get all users funds
// GET /api/v1/trade-admin/users/funds
router.get("/users/funds", authMiddleware, adminAuth, adminListUsersFunds);

// Get all open trades
// GET /api/v1/trade-admin/trades/open
router.get("/trades/open", authMiddleware, adminAuth, adminListOpenTrades);

// Get all closed trades
// GET /api/v1/trade-admin/trades/closed
router.get("/trades/closed", authMiddleware, adminAuth, adminListClosedTrades);

// Get currently open pending orders
// GET /api/v1/trade-admin/orders/pending/open
router.get("/orders/pending/open", authMiddleware, adminAuth, adminListPendingOrdersOpen);

// Get pending orders history
// GET /api/v1/trade-admin/orders/pending/history
router.get("/orders/pending/history", authMiddleware, adminAuth, adminListPendingOrdersHistory);

/* ============================
   BACKWARD COMPATIBLE ROUTES
============================ */

// Old route for open trades
router.get("/trade/open", authMiddleware, adminAuth, adminListOpenTrades);

// Old route for closed trades
router.get("/trade/closed", authMiddleware, adminAuth, adminListClosedTrades);

// Old route for open pending orders
router.get("/trade/pending/open", authMiddleware, adminAuth, adminListPendingOrdersOpen);

// Old route for pending history
router.get("/trade/pending/history", authMiddleware, adminAuth, adminListPendingOrdersHistory);

/* ============================
   ADMIN: TRADE MANAGEMENT
============================ */

// Place market order for user
// POST /api/v1/trade-admin/trade/market
router.post("/trade/market", authMiddleware, adminAuth, adminPlaceMarketOrder);

// Place pending order for user
// POST /api/v1/trade-admin/trade/pending
router.post("/trade/pending", authMiddleware, adminAuth, adminPlacePendingOrder);

// Modify existing pending order
// PATCH /api/v1/trade-admin/trade/pending/modify
router.patch("/trade/pending/modify", authMiddleware, adminAuth, adminModifyPendingOrder);

// Cancel pending order
// POST /api/v1/trade-admin/trade/pending/cancel
router.post("/trade/pending/cancel", authMiddleware, adminAuth, adminCancelPendingOrder);

// Modify open position
// PATCH /api/v1/trade-admin/trade/position/modify
router.patch("/trade/position/modify", authMiddleware, adminAuth, adminModifyPosition);

// Close open position
// POST /api/v1/trade-admin/trade/position/close
router.post("/trade/position/close", authMiddleware, adminAuth, adminClosePosition);

// Export router
export default router;
