import express from 'express';
import {
  createAccountPlan,
  updateAccountPlan,
  deleteAccountPlan,
  getPlansAdmin,
  getPlansForUser
} from '../../controllers/accountPlan.controller.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

/* USER */
router.get('/active', getPlansForUser);

/* ADMIN */
router.post('/',authMiddleware, adminAuth, createAccountPlan);
router.get('/',authMiddleware, adminAuth, getPlansAdmin);
router.put('/:id',authMiddleware, adminAuth, updateAccountPlan);
router.delete('/:id',authMiddleware, adminAuth, deleteAccountPlan);

export default router;
