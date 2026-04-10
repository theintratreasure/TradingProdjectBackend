import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

import {
  createAccountController,
  getMyAccounts,
  getMyAccountDetail,
  resetDemoAccountController,
  setAccountLeverageController,
  adminListUserAccountsController,
  adminSearchAccountsController,
  adminUpdateAccountController,
  adminDeleteAccountController
} from "../../controllers/account.controller.js";

const router = express.Router();

router.post("/", authMiddleware, createAccountController);
router.get("/", authMiddleware, getMyAccounts);
router.get("/single/:id", authMiddleware, getMyAccountDetail);
router.post("/:id/reset-demo", authMiddleware, resetDemoAccountController);
router.post("/:id/set-leverage", authMiddleware, setAccountLeverageController);
router.get("/admin/user/:userId", authMiddleware, adminAuth, adminListUserAccountsController);
router.get("/admin/search", authMiddleware, adminAuth, adminSearchAccountsController);
router.patch("/admin/:accountId", authMiddleware, adminAuth, adminUpdateAccountController);
router.delete("/admin/:accountId", authMiddleware, adminAuth, adminDeleteAccountController);

export default router;
