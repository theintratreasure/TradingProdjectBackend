import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI
export async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 50,        // important for concurrency
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed', err.message);
    process.exit(1);
  }
}
