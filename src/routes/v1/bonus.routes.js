import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  adminGetBonusSettings,
  adminUpdateBonusSettings,
  adminCreditBonus,
} from "../../controllers/bonus.controller.js";

const router = express.Router();

// Admin settings
router.get("/settings", authMiddleware, adminAuth, adminGetBonusSettings);
router.put("/settings", authMiddleware, adminAuth, adminUpdateBonusSettings);

// Admin manual credit
router.post("/admin/credit", authMiddleware, adminAuth, adminCreditBonus);

export default router;
