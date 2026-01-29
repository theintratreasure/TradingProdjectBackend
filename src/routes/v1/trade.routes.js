import { Router } from "express";
import {
  placeMarketOrderController,
  placePendingOrderController,
  modifyPositionController,
  modifyPendingOrderController,
  closePosition,
  cancelPendingOrderController,
  getOrdersController,
  getDealsController,
  getTradeSummaryController,
  getPositionsController,
} from "../../controllers/trade.controller.js";
import { accountAuthMiddleware } from "../../middlewares/accountAuth.middleware.js";

const router = Router();

/* =========================
   MARKET ORDERS
========================= */
router.post("/market", accountAuthMiddleware, placeMarketOrderController);

/* =========================
   PENDING ORDERS
========================= */
router.post("/pending", accountAuthMiddleware, placePendingOrderController);
router.patch("/pending/modify", accountAuthMiddleware, modifyPendingOrderController);
router.post("/pending/cancel", accountAuthMiddleware, cancelPendingOrderController);

/* =========================
   OPEN POSITIONS
========================= */
router.patch("/position/modify", accountAuthMiddleware, modifyPositionController);
router.post("/position/close", accountAuthMiddleware, closePosition);

/* =========================
   HISTORY & REPORTS
========================= */
router.get("/orders", accountAuthMiddleware, getOrdersController);
router.get("/deals", accountAuthMiddleware, getDealsController);
router.get("/summary", accountAuthMiddleware, getTradeSummaryController);
router.get("/positions", accountAuthMiddleware, getPositionsController);

export default router;
