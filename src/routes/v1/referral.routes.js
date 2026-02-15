import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import {
  getMyReferralSummary,
  listMyReferralRewards,
  requestReferralReward,
  adminListReferralRewards,
  adminApproveReferralReward,
  adminRejectReferralReward,
} from "../../controllers/referral.controller.js";

const router = express.Router();

// User routes
router.get("/summary", authMiddleware, getMyReferralSummary);
router.get("/rewards", authMiddleware, listMyReferralRewards);
router.post("/request", authMiddleware, requestReferralReward);

// Admin routes
router.get("/admin/rewards", authMiddleware, adminAuth, adminListReferralRewards);
router.patch(
  "/admin/:rewardId/approve",
  authMiddleware,
  adminAuth,
  adminApproveReferralReward,
);
router.patch(
  "/admin/:rewardId/reject",
  authMiddleware,
  adminAuth,
  adminRejectReferralReward,
);

export default router;
