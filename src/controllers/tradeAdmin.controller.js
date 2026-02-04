import { getTradeAdminSummaryService } from "../services/tradeAdmin.service.js";

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
