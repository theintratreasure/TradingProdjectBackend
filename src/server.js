import cluster from 'node:cluster';
import dotenv from 'dotenv';
import os from 'node:os';
import http from 'node:http';
import app from './app.js';
import { connectDB } from './config/database.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const CPU_COUNT = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Master ${process.pid} running`);
  console.log(`Forking ${CPU_COUNT} workers`);

  for (let i = 0; i < CPU_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.error(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

} else {
  await connectDB();

  const server = http.createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} listening on port ${PORT}`);
  });
}
