import express from "express";
import { getPropertyBySymbol } from "../../controllers/property.controller.js";
import { accountAuthMiddleware } from "../../middlewares/accountAuth.middleware.js";

const router = express.Router();

// GET /api/v1/property/:symbol
router.get("/:symbol", accountAuthMiddleware, getPropertyBySymbol);

export default router;
