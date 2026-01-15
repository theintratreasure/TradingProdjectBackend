import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('MongoDB connection failed: MONGO_URI is missing in .env');
    process.exit(1);
  }

  try {
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
