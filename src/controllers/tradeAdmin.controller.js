import { adminListBrokerageService, getTradeAdminSummaryService } from "../services/tradeAdmin.service.js";

export const getTradeAdminSummary = async (req, res) => {
  try {
    const data = await getTradeAdminSummaryService();

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const adminListBrokerage = async (req, res) => {
  try {
    const result = await adminListBrokerageService(req.query);

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
