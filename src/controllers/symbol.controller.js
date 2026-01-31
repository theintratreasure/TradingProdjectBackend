import { bulkInsertSymbolsService, getSymbolsService } from '../services/symbol.service.js';

export async function getSymbols(req, res) {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate and sanitize inputs
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const isActiveBool = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    const sortOrderStr = sortOrder === 'asc' ? 'asc' : 'desc';
    const allowedSortFields = ['name', 'code', 'category', 'createdAt', 'updatedAt'];
    const sortByStr = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const result = await getSymbolsService({
      page: pageNum,
      limit: limitNum,
      category,
      isActive: isActiveBool,
      search,
      sortBy: sortByStr,
      sortOrder: sortOrderStr
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

export async function bulkAddSymbols(req, res) {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'symbols array is required'
      });
    }

    const result = await bulkInsertSymbolsService(symbols);

    return res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
