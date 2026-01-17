import { watchlistService } from '../services/watchlist.service.js';

/**
 * ✅ USER APIs
 */

export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await watchlistService.ensureDefaultForUser(userId);

    const limit = watchlistService.parseLimit(req.query.limit);
    const items = await watchlistService.getUserWatchlist(userId, limit);

    return res.status(200).json({
      success: true,
      message: 'Watchlist fetched',
      data: items,
    });
  } catch (error) {
    console.log('GET WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getWatchlistItem = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await watchlistService.getOne(userId, req.params.code);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Watchlist item fetched',
      data: result.data,
    });
  } catch (error) {
    console.log('GET WATCHLIST ITEM ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await watchlistService.addUserItem(userId, req.body);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(result.alreadyExists ? 200 : 201).json({
      success: true,
      message: result.alreadyExists ? 'Already in watchlist' : 'Added to watchlist',
      data: result.data,
    });
  } catch (error) {
    console.log('ADD WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await watchlistService.removeUserItem(userId, req.params.code);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Removed from watchlist',
      data: result.data,
    });
  } catch (error) {
    console.log('REMOVE WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * ✅ DEFAULT WATCHLIST APIs (ADMIN / YOUR CONTROL)
 */

export const getDefaultWatchlist = async (req, res) => {
  try {
    const list = await watchlistService.getDefaultList();

    return res.status(200).json({
      success: true,
      message: 'Default watchlist fetched',
      data: list,
    });
  } catch (error) {
    console.log('GET DEFAULT WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const addDefaultWatchlistItem = async (req, res) => {
  try {
    const result = await watchlistService.addDefaultItem(req.body);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.log('ADD DEFAULT WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const removeDefaultWatchlistItem = async (req, res) => {
  try {
    const result = await watchlistService.removeDefaultItem(req.params.code);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.log('REMOVE DEFAULT WATCHLIST ERROR =>', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
