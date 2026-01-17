import { Router } from 'express';
import {
  addToWatchlist,
  getWatchlist,
  getWatchlistItem,
  removeFromWatchlist,

  getDefaultWatchlist,
  addDefaultWatchlistItem,
  removeDefaultWatchlistItem,
} from '../../controllers/watchlist.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = Router();

// user watchlist
router.get('/', authMiddleware, getWatchlist);
router.get('/:code', authMiddleware, getWatchlistItem);
router.post('/add', authMiddleware, addToWatchlist);
router.delete('/remove/:code', authMiddleware, removeFromWatchlist);

// default watchlist (admin)
router.get('/default/list',authMiddleware, getDefaultWatchlist);
router.post('/default/add',authMiddleware, adminAuth, addDefaultWatchlistItem);
router.delete('/default/remove/:code', authMiddleware, adminAuth , removeDefaultWatchlistItem);

export default router;
