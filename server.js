require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */

// Cho phép frontend gọi API
app.use(
    cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })
);

// Nhận dữ liệu JSON

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

app.use('/api/products', require('./routes/productRoutes'));

app.use('/api/orders', orderRoutes);

// Nhận dữ liệu từ form
app.use(
    express.urlencoded({
        extended: true
    })
);

/* =====================================================
   STATIC FILES
===================================================== */

// Thư mục public chứa index.html, admin.html, CSS, JS, ảnh...
app.use(express.static(path.join(__dirname, 'public')));

/* =====================================================
   API ROUTES
===================================================== */

app.use('/api/orders', orderRoutes);

/* =====================================================
   FRONTEND ROUTES
===================================================== */

// Trang chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Trang quản trị
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API kiểm tra server
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running'
    });
});

/* =====================================================
   ERROR HANDLING
===================================================== */

// API không tồn tại
app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API không tồn tại'
    });
});

// Xử lý lỗi server
app.use((err, req, res, next) => {
    console.error('Server error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Lỗi máy chủ'
    });
});

/* =====================================================
   START SERVER
===================================================== */

const startServer = async () => {
    try {
        // Chờ kết nối MongoDB thành công
        await connectDB();

        const PORT = process.env.PORT || 3000;

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Không thể khởi động server:', error.message);
        process.exit(1);
    }
};

startServer();