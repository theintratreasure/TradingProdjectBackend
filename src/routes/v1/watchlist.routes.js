import { Router } from 'express';
import {
  addToWatchlist,
  getWatchlist,
  getWatchlistItem,
  removeFromWatchlist,

  getDefaultWatchlist,
  addDefaultWatchlistItem,
  removeDefaultWatchlistItem,
  getSegmentInstrumentsWithWatchlistStatus,
  searchInstrumentsWithWatchlistStatus,
} from '../../controllers/watchlist.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { adminAuth } from '../../middlewares/adminAuth.middleware.js';

const router = Router();

// user watchlist
router.get('/', authMiddleware, getWatchlist);
router.get('/:code', authMiddleware, getWatchlistItem);
router.post('/add', authMiddleware, addToWatchlist);
router.delete('/remove/:code', authMiddleware, removeFromWatchlist);
//  segment wise instruments + isAdded status
router.get('/segment/:segment',authMiddleware,getSegmentInstrumentsWithWatchlistStatus);
// search route 
router.get('/search/instruments', authMiddleware, searchInstrumentsWithWatchlistStatus);
// default watchlist (admin)
router.get('/default/list',authMiddleware, getDefaultWatchlist);
router.post('/default/add',authMiddleware, adminAuth, addDefaultWatchlistItem);
router.delete('/default/remove/:code', authMiddleware, adminAuth , removeDefaultWatchlistItem);

export default router;
