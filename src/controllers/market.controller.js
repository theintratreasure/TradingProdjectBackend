import { marketService } from '../services/market.service.js';

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

  return res.json({ message: 'Schedule updated', data: result.data });
};

export const getMarketStatus = async (req, res) => {
  const { segment } = req.params;

  const result = await marketService.getMarketStatus(segment);
  if (result.error) return res.status(result.error.status).json(result.error);

  return res.json(result.data);
};
