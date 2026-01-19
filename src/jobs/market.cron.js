import cron from 'node-cron';
import { MarketSchedule } from '../models/MarketSchedule.model.js';
import { marketService } from '../services/market.service.js';

export const startMarketCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const segments = await MarketSchedule.find({}).select('segment').lean();
      for (const s of segments) {
        await marketService.getMarketStatus(s.segment);
      }
    } catch (err) {
      console.error('Market cron error:', err);
    }
  });

  console.log('Market cron started: every minute');
};
