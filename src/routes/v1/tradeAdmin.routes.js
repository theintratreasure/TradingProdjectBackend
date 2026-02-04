import { Router } from "express";
import { getTradeAdminSummary } from "../../controllers/tradeAdmin.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = Router();

// GET /api/v1/trade-admin/summary
router.get("/summary", authMiddleware, adminAuth, getTradeAdminSummary);

export default router;
