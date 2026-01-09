import { bulkInsertSymbolsService } from '../services/symbol.service.js';

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
