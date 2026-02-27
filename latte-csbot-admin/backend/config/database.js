/**
 * DATABASE CONFIGURATION
 * ======================
 * Centralized database connection management / การจัดการการเชื่อมต่อฐานข้อมูลส่วนกลาง
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB database / เชื่อมต่อฐานข้อมูล MongoDB
 */
async function connectDatabase() {
    if (isConnected) {
        return;
    }

    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/latte-csbot';
        
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
            bufferMaxEntries: 0
        };

        await mongoose.connect(mongoUri, options);
        
        isConnected = true;

        // Handle connection events / จัดการเหตุการณ์การเชื่อมต่อ
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

        // Graceful shutdown / ปิดการเชื่อมต่ออย่างสมบูรณ์
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
function getConnectionStatus() {
    return {
        isConnected,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
    };
}

/**
 * Close database connection / ปิดการเชื่อมต่อฐานข้อมูล
 */
async function closeDatabase() {
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

module.exports = {
    connectDatabase,
    getConnectionStatus,
    closeDatabase
};
