const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
            throw new Error(
                'Không tìm thấy MONGO_URI. Hãy kiểm tra file .env và vị trí chạy server.'
            );
        }

        const connection = await mongoose.connect(mongoUri);

        console.log(`MongoDB connected: ${connection.connection.host}`);

        return connection;
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        throw error;
    }
};

module.exports = connectDB;