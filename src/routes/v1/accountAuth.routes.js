import express from "express";
import { accountLoginController, resetTradePasswordController, resetWatchPasswordController } from "../../controllers/accountAuth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/login", accountLoginController);
// reset trade password
router.post("/:accountId/reset-trade-password",authMiddleware,resetTradePasswordController);
// watch password reset
router.post("/:accountId/reset-watch-password",authMiddleware,resetWatchPasswordController);

export default router;
