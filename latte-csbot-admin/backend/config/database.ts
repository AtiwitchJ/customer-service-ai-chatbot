/**
 * DATABASE CONFIGURATION
 * ======================
 * Centralized database connection management / การจัดการการเชื่อมต่อฐานข้อมูลส่วนกลาง
 */

import mongoose from 'mongoose';

let isConnected = false;

/**
 * Connect to MongoDB database / เชื่อมต่อฐานข้อมูล MongoDB
 */
export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/latte-csbot';

    const options: mongoose.ConnectOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    };

    await mongoose.connect(mongoUri, options);

    isConnected = true;

    mongoose.connection.on('error', (error) => {
      console.error('Database connection error:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
    });

    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        process.exit(0);
      } catch (error) {
        console.error('Error closing database connection:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

/**
 * Get database connection status / ดึงสถานะการเชื่อมต่อ
 */
export function getConnectionStatus(): {
  isConnected: boolean;
  readyState: number;
  host?: string;
  port?: number;
  name?: string;
} {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name,
  };
}

/**
 * Close database connection / ปิดการเชื่อมต่อฐานข้อมูล
 */
export async function closeDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.connection.close();
    isConnected = false;
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
}
