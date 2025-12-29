import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

import {
  createAccountController,
  getMyAccounts,
  getMyAccountDetail,
  resetDemoAccountController
} from "../../controllers/account.controller.js";

const router = express.Router();

router.post("/", authMiddleware, createAccountController);
router.get("/", authMiddleware, getMyAccounts);
router.get("/single/:id", authMiddleware, getMyAccountDetail);
router.post("/:id/reset-demo", authMiddleware, resetDemoAccountController);

export default router;
