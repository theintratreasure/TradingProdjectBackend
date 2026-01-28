import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
  closePosition,
  placeMarketOrderController,
} from "../../controllers/trade.controller.js";

const router = Router();

/**
 * POST /api/v1/trade/market
 */
router.post( "/market", authMiddleware,  placeMarketOrderController);

router.post("/close", closePosition);

export default router;
