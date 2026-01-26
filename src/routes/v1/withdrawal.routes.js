import express from "express";
import {
  createWithdrawalRequestController,
  listUserWithdrawalsController,
  listAdminWithdrawalsController,
  adminApproveWithdrawalController,
  adminRejectWithdrawalController,
} from "../../controllers/withdrawal.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

/**
 * USER ROUTES
 */
router.post("/", authMiddleware, createWithdrawalRequestController);
router.get("/", authMiddleware, listUserWithdrawalsController);

/**
 * ADMIN ROUTES
 */
router.get("/admin/all",authMiddleware, adminAuth, listAdminWithdrawalsController);
router.patch("/admin/:withdrawalId/approve",authMiddleware,adminAuth, adminApproveWithdrawalController);
router.patch("/admin/:withdrawalId/reject",authMiddleware,adminAuth, adminRejectWithdrawalController);

export default router;
