import os from 'node:os';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';

export const healthCheck = (req, res) => {
  // Get available RAM space
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const availableRam = freeMemory / (1024 * 1024 * 1024); // Convert to GB

  // Get last 15 logs
  const logFilePath = path.join(process.cwd(), 'logs', 'app.log');
  let last15Logs = [];
  try {
    if (fs.existsSync(logFilePath)) {
      const logData = fs.readFileSync(logFilePath, 'utf-8');
      const logs = logData.split('\n').filter(line => line.trim() !== '');
      last15Logs = logs.slice(-15);
    }
  } catch (error) {
    logger.error('Error reading log file:', error);
  }

  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      availableRam: `${availableRam.toFixed(2)} GB`
    },
    cpuLoad: os.loadavg(),
    last15Logs: last15Logs
  });
};
