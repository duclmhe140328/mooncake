require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');
const seoRoutes = require('./routes/seoRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

/* =====================================================
   CẤU HÌNH ĐĂNG NHẬP ADMIN CỐ ĐỊNH
===================================================== */

const ADMIN_USERNAME = 'legatalk';
const ADMIN_PASSWORD = 'Legatalkdangcapvippro';

const ADMIN_SESSION_SECRET =
    process.env.ADMIN_SESSION_SECRET ||
    'nethanoi-admin-session-secret-2026-change-this';

const ADMIN_COOKIE_NAME = 'nethanoi_admin_session';
const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60 * 1000; // 12 giờ

function safeEqual(valueA, valueB) {
    const bufferA = Buffer.from(String(valueA));
    const bufferB = Buffer.from(String(valueB));

    if (bufferA.length !== bufferB.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
}

function parseCookies(req) {
    const cookieHeader = String(req.headers.cookie || '');
    const cookies = {};

    cookieHeader.split(';').forEach((part) => {
        const separatorIndex = part.indexOf('=');

        if (separatorIndex === -1) {
            return;
        }

        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();

        if (!key) {
            return;
        }

        try {
            cookies[key] = decodeURIComponent(value);
        } catch {
            cookies[key] = value;
        }
    });

    return cookies;
}

function signAdminSession(payload) {
    return crypto
        .createHmac('sha256', ADMIN_SESSION_SECRET)
        .update(payload)
        .digest('hex');
}

function createAdminSessionToken() {
    const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE;
    const payload = `${ADMIN_USERNAME}.${expiresAt}`;
    const signature = signAdminSession(payload);

    return Buffer.from(
        `${payload}.${signature}`
    ).toString('base64url');
}

function verifyAdminSessionToken(token) {
    if (!token) {
        return false;
    }

    try {
        const decoded = Buffer
            .from(token, 'base64url')
            .toString('utf8');

        const parts = decoded.split('.');

        if (parts.length !== 3) {
            return false;
        }

        const [username, expiresAtText, receivedSignature] =
            parts;

        const expiresAt = Number(expiresAtText);

        if (
            username !== ADMIN_USERNAME ||
            !Number.isFinite(expiresAt) ||
            expiresAt <= Date.now()
        ) {
            return false;
        }

        const expectedSignature = signAdminSession(
            `${username}.${expiresAtText}`
        );

        return safeEqual(
            receivedSignature,
            expectedSignature
        );
    } catch {
        return false;
    }
}

function isAdminAuthenticated(req) {
    const cookies = parseCookies(req);

    return verifyAdminSessionToken(
        cookies[ADMIN_COOKIE_NAME]
    );
}

function setAdminCookie(res, token) {
    const options = [
        `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        `Max-Age=${Math.floor(
            ADMIN_SESSION_MAX_AGE / 1000
        )}`,
        'HttpOnly',
        'SameSite=Lax'
    ];

    if (process.env.NODE_ENV === 'production') {
        options.push('Secure');
    }

    res.setHeader('Set-Cookie', options.join('; '));
}

function clearAdminCookie(res) {
    const options = [
        `${ADMIN_COOKIE_NAME}=`,
        'Path=/',
        'Max-Age=0',
        'HttpOnly',
        'SameSite=Lax'
    ];

    if (process.env.NODE_ENV === 'production') {
        options.push('Secure');
    }

    res.setHeader('Set-Cookie', options.join('; '));
}

function getSafeNextUrl(value) {
    if (
        typeof value === 'string' &&
        value.startsWith('/') &&
        !value.startsWith('//')
    ) {
        return value;
    }

    return '/admin';
}

function requireAdminPage(req, res, next) {
    if (isAdminAuthenticated(req)) {
        return next();
    }

    const nextUrl = encodeURIComponent(
        req.originalUrl || '/admin'
    );

    return res.redirect(
        `/admin-login?next=${nextUrl}`
    );
}

function requireAdminApi(req, res, next) {
    if (isAdminAuthenticated(req)) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message:
            'Bạn cần đăng nhập quản trị để thực hiện thao tác này.'
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderAdminLoginPage({
    errorMessage = '',
    nextUrl = '/admin'
} = {}) {
    const safeError = escapeHtml(errorMessage);
    const safeNextUrl = escapeHtml(
        getSafeNextUrl(nextUrl)
    );

    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >
    <title>Đăng nhập quản trị</title>

    <style>
        :root {
            --bg: #080808;
            --panel: rgba(18, 18, 18, 0.96);
            --gold: #d4af37;
            --gold-light: #f7e39a;
            --wine: #6b0b1a;
            --text: #f4f0e7;
            --muted: #9a9489;
            --border: rgba(212, 175, 55, 0.38);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial, "Segoe UI", sans-serif;
            color: var(--text);
            background:
                radial-gradient(
                    circle at 20% 10%,
                    rgba(107, 11, 26, 0.42),
                    transparent 34%
                ),
                radial-gradient(
                    circle at 85% 90%,
                    rgba(212, 175, 55, 0.15),
                    transparent 34%
                ),
                linear-gradient(
                    135deg,
                    #050505,
                    #12090b 55%,
                    #080808
                );
        }

        .login-card {
            width: min(100%, 440px);
            padding: 38px 34px;
            position: relative;
            overflow: hidden;
            border: 1px solid var(--border);
            background: var(--panel);
            box-shadow:
                0 28px 70px rgba(0, 0, 0, 0.62),
                inset 0 0 0 1px
                    rgba(255, 255, 255, 0.025);
        }

        .login-card::before,
        .login-card::after {
            content: "";
            position: absolute;
            width: 42px;
            height: 42px;
            border-color: var(--gold);
            opacity: 0.8;
        }

        .login-card::before {
            top: 12px;
            left: 12px;
            border-top: 1px solid;
            border-left: 1px solid;
        }

        .login-card::after {
            right: 12px;
            bottom: 12px;
            border-right: 1px solid;
            border-bottom: 1px solid;
        }

        .eyebrow {
            margin: 0 0 8px;
            color: var(--gold);
            font-size: 11px;
            letter-spacing: 4px;
            text-align: center;
            text-transform: uppercase;
        }

        h1 {
            margin: 0 0 10px;
            color: var(--gold-light);
            font-family: Georgia, "Times New Roman", serif;
            font-size: 34px;
            font-weight: 500;
            text-align: center;
        }

        .subtitle {
            margin: 0 0 28px;
            color: var(--muted);
            font-size: 14px;
            line-height: 1.6;
            text-align: center;
        }

        .error {
            margin-bottom: 18px;
            padding: 12px 14px;
            border: 1px solid rgba(220, 65, 65, 0.5);
            background: rgba(107, 11, 26, 0.28);
            color: #ffd8d8;
            font-size: 13px;
            line-height: 1.5;
        }

        .form-group {
            margin-bottom: 18px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #c9c1b4;
            font-size: 12px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        input {
            width: 100%;
            height: 50px;
            padding: 0 15px;
            border: 1px solid rgba(212, 175, 55, 0.28);
            outline: none;
            background: rgba(0, 0, 0, 0.44);
            color: #ffffff;
            font-size: 15px;
            transition: 0.2s ease;
        }

        input:focus {
            border-color: var(--gold);
            box-shadow:
                0 0 0 3px rgba(212, 175, 55, 0.08);
        }

        button {
            width: 100%;
            min-height: 50px;
            margin-top: 8px;
            border: 1px solid var(--gold);
            cursor: pointer;
            background:
                linear-gradient(
                    135deg,
                    #7d111d,
                    var(--wine)
                );
            color: var(--gold-light);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 2.4px;
            text-transform: uppercase;
            transition: 0.2s ease;
        }

        button:hover {
            transform: translateY(-1px);
            background:
                linear-gradient(
                    135deg,
                    #971728,
                    #71101d
                );
            box-shadow:
                0 12px 28px rgba(107, 11, 26, 0.34);
        }

        .home-link {
            display: block;
            margin-top: 20px;
            color: var(--muted);
            font-size: 13px;
            text-align: center;
            text-decoration: none;
        }

        .home-link:hover {
            color: var(--gold-light);
        }

        @media (max-width: 480px) {
            body {
                padding: 14px;
            }

            .login-card {
                padding: 32px 22px;
            }

            h1 {
                font-size: 29px;
            }
        }
    </style>
</head>

<body>
    <main class="login-card">
        <p class="eyebrow">Trung Thu Phố</p>
        <h1>Quản trị hệ thống</h1>

        <p class="subtitle">
            Đăng nhập để quản lý đơn hàng và sản phẩm.
        </p>

        ${
            safeError
                ? `<div class="error">${safeError}</div>`
                : ''
        }

        <form method="POST" action="/admin-login">
            <input
                type="hidden"
                name="next"
                value="${safeNextUrl}"
            >

            <div class="form-group">
                <label for="username">
                    Tên đăng nhập
                </label>

                <input
                    id="username"
                    name="username"
                    type="text"
                    autocomplete="username"
                    required
                    autofocus
                >
            </div>

            <div class="form-group">
                <label for="password">
                    Mật khẩu
                </label>

                <input
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                >
            </div>

            <button type="submit">
                Đăng nhập
            </button>
        </form>

        <a class="home-link" href="/">
            Quay lại trang chủ
        </a>
    </main>
</body>
</html>`;
}

/* =====================================================
   MIDDLEWARE CHUNG
===================================================== */

app.set('trust proxy', 1);

app.use(
    cors({
        origin: true,
        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],
        allowedHeaders: [
            'Content-Type',
            'Authorization'
        ]
    })
);

app.use(
    express.json({
        limit: '30mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '30mb'
    })
);

/* =====================================================
   ĐĂNG NHẬP / ĐĂNG XUẤT ADMIN
===================================================== */

app.get('/admin-login', (req, res) => {
    if (isAdminAuthenticated(req)) {
        return res.redirect(
            getSafeNextUrl(req.query.next)
        );
    }

    return res.status(200).send(
        renderAdminLoginPage({
            nextUrl: req.query.next || '/admin'
        })
    );
});

app.post('/admin-login', (req, res) => {
    const username = String(
        req.body.username || ''
    );

    const password = String(
        req.body.password || ''
    );

    const nextUrl = getSafeNextUrl(
        req.body.next
    );

    const usernameCorrect = safeEqual(
        username,
        ADMIN_USERNAME
    );

    const passwordCorrect = safeEqual(
        password,
        ADMIN_PASSWORD
    );

    if (!usernameCorrect || !passwordCorrect) {
        return res.status(401).send(
            renderAdminLoginPage({
                errorMessage:
                    'Tên đăng nhập hoặc mật khẩu không chính xác.',
                nextUrl
            })
        );
    }

    setAdminCookie(
        res,
        createAdminSessionToken()
    );

    return res.redirect(nextUrl);
});

app.get('/admin-logout', (req, res) => {
    clearAdminCookie(res);
    return res.redirect('/admin-login');
});

app.post('/admin-logout', (req, res) => {
    clearAdminCookie(res);
    return res.redirect('/admin-login');
});

/* =====================================================
   TRANG ADMIN ĐƯỢC BẢO VỆ
   Phải đặt trước express.static để không bị truy cập thẳng.
===================================================== */

app.get(
    ['/admin', '/admin.html'],
    requireAdminPage,
    (req, res) => {
        return res.sendFile(
            path.join(PUBLIC_DIR, 'admin.html')
        );
    }
);

app.get(
    [
        '/admin-products',
        '/admin-products.html'
    ],
    requireAdminPage,
    (req, res) => {
        return res.sendFile(
            path.join(
                PUBLIC_DIR,
                'admin-products.html'
            )
        );
    }
);

/* =====================================================
   API ROUTES
===================================================== */

// API quản trị đơn hàng: phân trang, cập nhật COD, đồng bộ lượt bán.
app.use(
    '/api/admin/orders',
    requireAdminApi,
    adminOrderRoutes
);

// QR chuyển khoản ngân hàng và webhook SePay.
app.use('/api/payments', paymentRoutes);

// Đánh giá sản phẩm công khai; backend tự xác minh đơn đủ điều kiện.
app.use('/api/reviews', reviewRoutes);

// GET sản phẩm công khai để frontend đọc.
// POST/PUT/PATCH/DELETE bắt buộc đăng nhập admin.
app.use(
    '/api/products',
    (req, res, next) => {
        if (
            req.method === 'GET' ||
            req.method === 'HEAD'
        ) {
            return next();
        }

        return requireAdminApi(
            req,
            res,
            next
        );
    },
    productRoutes
);

// POST tạo đơn, VNPay return và IPN vẫn công khai.
// Chỉ GET /api/orders để lấy danh sách đơn cần đăng nhập.
app.use(
    '/api/orders',
    (req, res, next) => {
        if (
            req.method === 'GET' &&
            (req.path === '/' || req.path === '')
        ) {
            return requireAdminApi(
                req,
                res,
                next
            );
        }

        return next();
    },
    orderRoutes
);

app.get('/api/health', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Server is running'
    });
});

app.use('/', seoRoutes);

/* =====================================================
   STATIC FILES VÀ FRONTEND
===================================================== */

app.use(
    express.static(PUBLIC_DIR, {
        index: false
    })
);

app.get('/', (req, res) => {
    return res.sendFile(
        path.join(PUBLIC_DIR, 'index.html')
    );
});

/* =====================================================
   ERROR HANDLING
===================================================== */

app.use('/api', (req, res) => {
    return res.status(404).json({
        success: false,
        message: 'API không tồn tại'
    });
});

app.use((req, res) => {
    return res.status(404).sendFile(
        path.join(PUBLIC_DIR, 'index.html')
    );
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (res.headersSent) {
        return next(err);
    }

    return res.status(
        err.status || 500
    ).json({
        success: false,
        message:
            err.message ||
            'Lỗi máy chủ'
    });
});

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
    try {
        await connectDB();

        const PORT =
            process.env.PORT || 3000;

        app.listen(
            PORT,
            '0.0.0.0',
            () => {
                console.log(
                    `Server is running on port ${PORT}`
                );
            }
        );
    } catch (error) {
        console.error(
            'Không thể khởi động server:',
            error.message
        );

        process.exit(1);
    }
}

startServer();
