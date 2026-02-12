import express from "express";
import {
  createWithdrawalRequestController,
  listUserWithdrawalsController,
  listAdminWithdrawalsController,
  adminSearchWithdrawalsController,
  adminApproveWithdrawalController,
  adminRejectWithdrawalController,
  adminCreateWithdrawalController,
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
router.post("/admin/create", authMiddleware, adminAuth, adminCreateWithdrawalController);
router.get("/admin/search", authMiddleware, adminAuth, adminSearchWithdrawalsController);
router.get("/admin/all",authMiddleware, adminAuth, listAdminWithdrawalsController);
router.patch("/admin/:withdrawalId/approve",authMiddleware,adminAuth, adminApproveWithdrawalController);
router.patch("/admin/:withdrawalId/reject",authMiddleware,adminAuth, adminRejectWithdrawalController);

export default router;
