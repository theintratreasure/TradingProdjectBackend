import express from "express";
import {
  convertAmount,
  getConversionRates,
  upsertConversionRates,
} from "../../controllers/conversion.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js"
const router = express.Router();

// user
router.get("/rates", authMiddleware, getConversionRates);
router.post("/convert", authMiddleware, convertAmount);

// admin
router.get("/admin/rates", adminAuth, getConversionRates);
router.put("/admin/rates", adminAuth, upsertConversionRates);

export default router;
