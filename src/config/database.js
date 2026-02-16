import mongoose from 'mongoose';
import dns from 'node:dns';

function configureDnsServers() {
  const configured = process.env.DNS_SERVERS;
  if (!configured) return;

  const servers = configured
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!servers.length) return;

  try {
    dns.setServers(servers);
    console.log('DNS servers configured for Node:', servers.join(', '));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Failed to configure DNS servers:', message);
  }
}

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MongoDB connection failed: MONGO_URI is missing in .env');
    process.exit(1);
  }

  try {
    configureDnsServers();

    await mongoose.connect(uri, {
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('MongoDB connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MongoDB connection failed', message);
    process.exit(1);
  }
}
