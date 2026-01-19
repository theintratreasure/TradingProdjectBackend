import { watchlistService } from "../services/watchlist.service.js";
/**
 * USER APIs (ACCOUNT-WISE)
 */

export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;
    const accountId = String(req.query.accountId || "").trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!accountId) {
      return res
        .status(400)
        .json({ success: false, message: "accountId is required" });
    }

    // ✅ ensure default only for this account
    await watchlistService.ensureDefaultForAccount(userId, accountId);

    const limit = watchlistService.parseLimit(req.query.limit);

    const result = await watchlistService.getAccountWatchlist(userId, accountId, limit);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message || "Watchlist fetched",
      data: result.data || [],
    });
  } catch (error) {
    console.log("GET WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getWatchlistItem = async (req, res) => {
  try {
    const userId = req.user?._id;
    const accountId = String(req.query.accountId || "").trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!accountId) {
      return res
        .status(400)
        .json({ success: false, message: "accountId is required" });
    }

    const result = await watchlistService.getOne(
      userId,
      accountId,
      req.params.code
    );

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Watchlist item fetched",
      data: result.data,
    });
  } catch (error) {
    console.log("GET WATCHLIST ITEM ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;

    //  take accountId from body OR query (frontend flexibility)
    const accountId =
      String(req.body?.accountId || "").trim() ||
      String(req.query.accountId || "").trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!accountId) {
      return res
        .status(400)
        .json({ success: false, message: "accountId is required" });
    }

    const result = await watchlistService.addUserItem(userId, accountId, req.body);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(result.alreadyExists ? 200 : 201).json({
      success: true,
      message: result.message || (result.alreadyExists ? "Already in watchlist" : "Added to watchlist"),
      data: result.data,
    });
  } catch (error) {
    console.log("ADD WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user?._id;
    const accountId = String(req.query.accountId || "").trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!accountId) {
      return res
        .status(400)
        .json({ success: false, message: "accountId is required" });
    }

    const result = await watchlistService.removeUserItem(
      userId,
      accountId,
      req.params.code
    );

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ success: false, message: result.error.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message || "Removed from watchlist",
      data: result.data,
    });
  } catch (error) {
    console.log("REMOVE WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 *  DEFAULT WATCHLIST APIs (ADMIN / YOUR CONTROL)
 */

export const getDefaultWatchlist = async (req, res) => {
  try {
    const list = await watchlistService.getDefaultList();

    return res.status(200).json({
      success: true,
      message: "Default watchlist fetched",
      data: list,
    });
  } catch (error) {
    console.log("GET DEFAULT WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    console.log("ADD DEFAULT WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
    console.log("REMOVE DEFAULT WATCHLIST ERROR =>", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getSegmentInstrumentsWithWatchlistStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const accountId = String(req.query?.accountId || '').trim();
    const segment = String(req.params?.segment || '').trim();
    const limitRaw = req.query?.limit;

    const limit = watchlistService.parseLimit(limitRaw);

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await watchlistService.getSegmentInstrumentsWithStatus(
      userId,
      accountId,
      segment,
      limit
    );

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(200).json({
      message: 'Segment instruments fetched',
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const searchInstrumentsWithWatchlistStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const accountId = String(req.query?.accountId || "").trim();

    const q = String(req.query?.q || "").trim();
    const limit = watchlistService.parseLimit(req.query?.limit);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // segment ignore (global search)
    const result = await watchlistService.searchInstrumentsOnly(q, "", limit);

    if (result?.error) {
      return res
        .status(result.error.status)
        .json({ message: result.error.message });
    }

    return res.status(200).json({
      message: "Instruments search fetched",
      data: result.data,
    });
  } catch (error) {
    console.error("searchInstruments error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

