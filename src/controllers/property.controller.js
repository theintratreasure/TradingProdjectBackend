import { getPropertyBySymbolService } from "../services/property.service.js";

export const getPropertyBySymbol = async (req, res) => {
  try {
    const symbol = req.params.symbol || req.query.symbol;

    const accountId = req.account?.accountId;

    const property = await getPropertyBySymbolService(symbol, accountId);

    return res.json({
      success: true,
      data: property
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
