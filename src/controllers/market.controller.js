import { marketService } from '../services/market.service.js';
import { tradeEngine } from '../trade-engine/bootstrap.js';

export const getMarketSchedule = async (req, res) => {
  const { segment } = req.params;

  const result = await marketService.getSchedule(segment);
  if (result.error) return res.status(result.error.status).json(result.error);

  return res.json(result.data);
};

export const updateMarketSchedule = async (req, res) => {
  const { segment } = req.params;

  const result = await marketService.updateSchedule(segment, req.body);
  if (result.error) return res.status(result.error.status).json(result.error);

  // Keep the trade-engine in-process cache in sync immediately (no need to wait for cron).
  try {
    const statusRes = await marketService.getMarketStatus(segment);
    if (statusRes?.data) {
      tradeEngine.setMarketStatus(statusRes.data.segment, statusRes.data);
    }
  } catch (err) {
    console.error("[MARKET] status refresh failed after schedule update", err?.message || err);
  }

  return res.json({ message: 'Schedule updated', data: result.data });
};

export const getMarketStatus = async (req, res) => {
  const { segment } = req.params;

  const result = await marketService.getMarketStatus(segment);
  if (result.error) return res.status(result.error.status).json(result.error);

  return res.json(result.data);
};
