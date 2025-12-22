import { Router } from 'express';
import {
  createHoliday,
  getHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday
} from '../../controllers/holiday.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';
const router = Router();

router.get('/', getHolidays);
router.get('/:id', getHolidayById);

router.post('/',authMiddleware, adminAuth, createHoliday);
router.put('/:id', authMiddleware,adminAuth, updateHoliday);
router.delete('/:id',authMiddleware,adminAuth, deleteHoliday);

export default router;
