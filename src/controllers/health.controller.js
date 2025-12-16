import os from 'node:os';
import process from 'node:process';

export const healthCheck = (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed
    },
    cpuLoad: os.loadavg()
  });
};
