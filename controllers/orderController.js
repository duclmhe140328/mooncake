const crypto = require('crypto');
const qs = require('qs');

const Order = require('../models/Order');
const telegramService = require('../services/telegramService');
const vnpayService = require('../services/vnpayService');

/* =====================================================
   TẠO MÃ ĐƠN HÀNG
===================================================== */

function createOrderCode() {
    const now = new Date();

    const datePart = now
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');

    const randomPart = crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase();

    return `MH${datePart}${randomPart}`;
}

/* =====================================================
   SẮP XẾP THAM SỐ VNPAY
===================================================== */

function sortObject(obj) {
    const sorted = {};

    Object.keys(obj)
        .sort()
        .forEach((key) => {
            sorted[key] = encodeURIComponent(obj[key])
                .replace(/%20/g, '+');
        });

    return sorted;
}

/* =====================================================
   KIỂM TRA CHỮ KÝ VNPAY
===================================================== */

function verifyVnpayChecksum(query) {
    const secretKey = String(
        process.env.VNP_HASH_SECRET || ''
    ).trim();

    if (!secretKey) {
        console.error('Thiếu biến môi trường VNP_HASH_SECRET');
        return false;
    }

    const vnpParams = { ...query };

    const secureHash = String(
        vnpParams.vnp_SecureHash || ''
    ).toLowerCase();

    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    const sortedParams = sortObject(vnpParams);

    const signData = qs.stringify(sortedParams, {
        encode: false
    });

    const checkHash = crypto
        .createHmac('sha512', secretKey)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex')
        .toLowerCase();

    return secureHash === checkHash;
}

/* =====================================================
   LẤY IP KHÁCH HÀNG
===================================================== */

function getClientIp(req) {
    let ip =
        req.headers['x-forwarded-for'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        '127.0.0.1';

    ip = String(ip).split(',')[0].trim();

    if (ip === '::1') {
        return '127.0.0.1';
    }

    if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }

    return ip;
}

/* =====================================================
   TÍNH TỔNG TIỀN ĐƠN HÀNG
===================================================== */

function calcOrderTotal(orderData) {
    if (!Array.isArray(orderData.products)) {
        return Number(orderData.totalAmount || 0);
    }

    return orderData.products.reduce((sum, item) => {
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);

        return sum + price * quantity;
    }, 0);
}

/* =====================================================
   TÌM ĐƠN THEO MÃ VNPAY
===================================================== */

function getOrderLookup(txnRef) {
    return {
        $or: [
            {
                orderCode: txnRef
            },
            {
                vnpayTxnRef: txnRef
            }
        ]
    };
}

async function findOrderByTxnRef(txnRef) {
    if (!txnRef) {
        return null;
    }

    return Order.findOne(getOrderLookup(txnRef));
}

/* =====================================================
   KIỂM TRA SỐ TIỀN VNPAY
===================================================== */

function isVnpayAmountValid(order, vnpayQuery) {
    const amountFromVnpay = Number(
        vnpayQuery.vnp_Amount || 0
    );

    const expectedAmount = Math.round(
        Number(order.totalAmount || 0) * 100
    );

    return amountFromVnpay === expectedAmount;
}

/* =====================================================
   GỬI THÔNG BÁO TELEGRAM
===================================================== */

function sendTelegramNotification(order) {
    telegramService
        .sendOrderNotification(order)
        .catch((error) => {
            console.error(
                'Lỗi gửi Telegram:',
                error.message
            );
        });
}

/* =====================================================
   XÁC NHẬN ĐƠN ĐÃ THANH TOÁN
===================================================== */

async function confirmPaidVnpayOrder(txnRef, vnpayQuery) {
    const lookup = getOrderLookup(txnRef);

    const existingOrder = await Order.findOne(lookup);

    if (!existingOrder) {
        return {
            order: null,
            newlyPaid: false
        };
    }

    // Đơn đã được IPN hoặc Return xử lý trước đó
    if (existingOrder.paymentStatus === 'PAID') {
        return {
            order: existingOrder,
            newlyPaid: false
        };
    }

    /*
     * Cập nhật nguyên tử:
     * chỉ một request giữa Return và IPN được chuyển đơn sang PAID.
     */
    const updatedOrder = await Order.findOneAndUpdate(
        {
            $and: [
                lookup,
                {
                    paymentStatus: {
                        $ne: 'PAID'
                    }
                }
            ]
        },
        {
            $set: {
                paymentMethod: 'VNPAY',
                paymentStatus: 'PAID',
                orderStatus: 'CONFIRMED',

                vnpayTxnRef: txnRef,

                vnpayTransactionNo:
                    vnpayQuery.vnp_TransactionNo || '',

                vnpayBankCode:
                    vnpayQuery.vnp_BankCode || '',

                vnpayPayDate:
                    vnpayQuery.vnp_PayDate || '',

                vnpayResponseCode:
                    vnpayQuery.vnp_ResponseCode || '',

                vnpayTransactionStatus:
                    vnpayQuery.vnp_TransactionStatus || ''
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (updatedOrder) {
        sendTelegramNotification(updatedOrder);

        return {
            order: updatedOrder,
            newlyPaid: true
        };
    }

    // Request khác có thể đã cập nhật trước
    const latestOrder = await Order.findOne(lookup);

    return {
        order: latestOrder,
        newlyPaid: false
    };
}

/* =====================================================
   ĐÁNH DẤU THANH TOÁN THẤT BẠI
===================================================== */

async function markVnpayPaymentFailed(txnRef, vnpayQuery) {
    if (!txnRef) {
        return;
    }

    const lookup = getOrderLookup(txnRef);

    await Order.updateOne(
        {
            $and: [
                lookup,
                {
                    paymentStatus: {
                        $ne: 'PAID'
                    }
                }
            ]
        },
        {
            $set: {
                paymentStatus: 'FAILED',

                vnpayResponseCode:
                    vnpayQuery.vnp_ResponseCode || '',

                vnpayTransactionStatus:
                    vnpayQuery.vnp_TransactionStatus || '',

                vnpayTransactionNo:
                    vnpayQuery.vnp_TransactionNo || '',

                vnpayBankCode:
                    vnpayQuery.vnp_BankCode || '',

                vnpayPayDate:
                    vnpayQuery.vnp_PayDate || ''
            }
        }
    );
}

/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* =====================================================
   TRANG THÔNG BÁO LỖI
===================================================== */

function renderMessagePage({
    title,
    message,
    color = '#8b1d16',
    redirectSeconds = 4
}) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>${safeTitle}</title>

    <style>
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
            color: #4b261c;

            background:
                radial-gradient(
                    circle at top left,
                    rgba(255, 220, 145, 0.45),
                    transparent 32%
                ),
                radial-gradient(
                    circle at bottom right,
                    rgba(120, 20, 15, 0.38),
                    transparent 40%
                ),
                linear-gradient(
                    135deg,
                    #fff8e8 0%,
                    #f6ddb2 45%,
                    #8b1d16 100%
                );
        }

        .message-card {
            width: 100%;
            max-width: 520px;

            padding: 38px 25px;
            text-align: center;

            background: rgba(255, 250, 238, 0.98);
            border: 1px solid rgba(214, 168, 79, 0.7);
            border-radius: 28px;

            box-shadow:
                0 26px 65px rgba(72, 20, 15, 0.28);
        }

        .icon {
            width: 78px;
            height: 78px;
            margin: 0 auto 20px;

            display: flex;
            align-items: center;
            justify-content: center;

            border-radius: 50%;

            background: ${color};
            color: #ffffff;

            font-size: 38px;
            font-weight: 900;
        }

        h2 {
            margin: 0 0 15px;
            color: ${color};
            font-size: 28px;
        }

        p {
            margin: 0 auto 24px;
            max-width: 430px;

            color: #755139;
            font-size: 16px;
            line-height: 1.65;
        }

        a {
            display: inline-flex;
            align-items: center;
            justify-content: center;

            min-width: 210px;
            min-height: 48px;
            padding: 10px 22px;

            border-radius: 999px;

            color: #681711;
            background:
                linear-gradient(135deg, #d6a03c, #f5d47b);

            font-weight: 800;
            text-decoration: none;
        }

        .countdown {
            margin-top: 18px;
            font-size: 13px;
            color: #8b6135;
        }
    </style>
</head>

<body>
    <div class="message-card">
        <div class="icon">!</div>

        <h2>${safeTitle}</h2>

        <p>${safeMessage}</p>

        <a href="/">
            Về trang chủ
        </a>

        <div class="countdown">
            Tự động chuyển về trang chủ sau
            <span id="countdown">${redirectSeconds}</span>
            giây
        </div>
    </div>

    <script>
        var seconds = ${redirectSeconds};
        var countdownElement =
            document.getElementById('countdown');

        var timer = setInterval(function () {
            seconds -= 1;
            countdownElement.innerText = seconds;

            if (seconds <= 0) {
                clearInterval(timer);
                window.location.href = '/';
            }
        }, 1000);
    </script>
</body>
</html>
    `;
}

/* =====================================================
   TRANG THANH TOÁN THÀNH CÔNG
===================================================== */

function renderSuccessPage(order) {
    const orderCode = escapeHtml(order.orderCode);

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Thanh toán thành công</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            padding: 22px;

            display: flex;
            align-items: center;
            justify-content: center;

            font-family: Arial, "Segoe UI", sans-serif;
            color: #4b261c;

            background:
                radial-gradient(
                    circle at top left,
                    rgba(255, 220, 145, 0.45),
                    transparent 32%
                ),
                radial-gradient(
                    circle at bottom right,
                    rgba(120, 20, 15, 0.38),
                    transparent 40%
                ),
                linear-gradient(
                    135deg,
                    #fff8e8 0%,
                    #f6ddb2 45%,
                    #8b1d16 100%
                );
        }

        .success-page {
            width: 100%;
            max-width: 520px;
            position: relative;
        }

        .moon {
            position: absolute;
            top: -34px;
            left: 28px;
            z-index: 1;

            width: 88px;
            height: 88px;

            border-radius: 50%;

            background:
                radial-gradient(
                    circle at 35% 35%,
                    #fff8dc,
                    #ffd46d 68%,
                    #d39b35
                );

            box-shadow:
                0 0 35px rgba(255, 214, 109, 0.85);
        }

        .success-card {
            position: relative;
            z-index: 2;

            overflow: hidden;

            padding: 44px 28px 34px;

            text-align: center;

            background: rgba(255, 250, 238, 0.97);

            border:
                1px solid rgba(214, 168, 79, 0.65);

            border-radius: 30px;

            box-shadow:
                0 26px 65px rgba(72, 20, 15, 0.28),
                inset 0 0 0 1px
                    rgba(255, 255, 255, 0.72);

            animation: fadeUp 0.55s ease forwards;
        }

        .success-card::before {
            content: "";

            position: absolute;
            inset: 0;

            pointer-events: none;

            background:
                radial-gradient(
                    circle at 50% -10%,
                    rgba(255, 213, 122, 0.42),
                    transparent 34%
                ),
                linear-gradient(
                    90deg,
                    transparent,
                    rgba(255, 255, 255, 0.35),
                    transparent
                );
        }

        .success-card::after {
            content: "月";

            position: absolute;
            right: -12px;
            bottom: -42px;

            pointer-events: none;

            color: rgba(139, 29, 22, 0.055);

            font-size: 150px;
            line-height: 1;
            font-weight: 900;
        }

        .success-icon {
            position: relative;
            z-index: 2;

            width: 88px;
            height: 88px;

            margin: 0 auto 20px;

            display: flex;
            align-items: center;
            justify-content: center;

            border-radius: 50%;

            color: #7a1710;

            background:
                linear-gradient(135deg, #ffe08a, #c8902f);

            font-size: 46px;
            font-weight: 900;

            box-shadow:
                0 13px 30px rgba(184, 134, 11, 0.35),
                inset 0 2px 4px rgba(255, 255, 255, 0.72);
        }

        .success-title {
            position: relative;
            z-index: 2;

            margin: 0 0 12px;

            color: #7c1811;

            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.4px;
        }

        .success-desc {
            position: relative;
            z-index: 2;

            max-width: 420px;
            margin: 0 auto 24px;

            color: #755139;

            font-size: 16px;
            line-height: 1.65;
        }

        .order-box {
            position: relative;
            z-index: 2;

            margin: 24px auto 20px;
            padding: 20px 16px;

            border:
                1px dashed rgba(139, 29, 22, 0.48);

            border-radius: 22px;

            background:
                linear-gradient(135deg, #fff4d4, #ffe3a1);

            box-shadow:
                inset 0 1px 0 rgba(255, 255, 255, 0.65);
        }

        .order-label {
            margin: 0 0 8px;

            color: #8b6135;

            font-size: 14px;
            font-weight: 700;
        }

        .order-code {
            display: inline-block;

            color: #8b1d16;

            font-size: 31px;
            font-weight: 900;
            letter-spacing: 1.4px;

            text-shadow:
                0 1px 0 rgba(255, 255, 255, 0.85);

            user-select: all;
            word-break: break-word;
        }

        .copy-btn {
            margin-top: 15px;
            padding: 12px 20px;

            border: none;
            border-radius: 999px;

            cursor: pointer;

            color: #fff8df;

            background:
                linear-gradient(135deg, #8b1d16, #bd3a28);

            font-size: 14px;
            font-weight: 800;

            box-shadow:
                0 11px 24px rgba(139, 29, 22, 0.30);

            transition: 0.2s ease;
        }

        .copy-btn:hover {
            transform: translateY(-2px);

            box-shadow:
                0 15px 32px rgba(139, 29, 22, 0.38);
        }

        .note {
            position: relative;
            z-index: 2;

            margin: 16px auto 26px;

            color: #66432e;

            font-size: 15px;
            line-height: 1.65;
        }

        .home-link {
            position: relative;
            z-index: 2;

            display: inline-flex;
            align-items: center;
            justify-content: center;

            min-width: 225px;
            height: 50px;
            padding: 0 24px;

            border-radius: 999px;

            color: #681711;

            background:
                linear-gradient(135deg, #d6a03c, #f5d47b);

            font-size: 15px;
            font-weight: 900;
            text-decoration: none;

            box-shadow:
                0 13px 28px rgba(184, 134, 11, 0.30);

            transition: 0.2s ease;
        }

        .home-link:hover {
            transform: translateY(-2px);

            box-shadow:
                0 17px 36px rgba(184, 134, 11, 0.38);
        }

        .countdown-text {
            position: relative;
            z-index: 2;

            margin: 18px 0 0;

            color: #8b6135;

            font-size: 13px;
        }

        @keyframes fadeUp {
            from {
                opacity: 0;
                transform: translateY(18px) scale(0.98);
            }

            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @media (max-width: 480px) {
            body {
                padding: 18px;
            }

            .success-card {
                padding: 38px 20px 30px;
                border-radius: 26px;
            }

            .success-title {
                font-size: 25px;
            }

            .success-desc {
                font-size: 15px;
            }

            .order-code {
                font-size: 26px;
            }

            .success-icon {
                width: 78px;
                height: 78px;
                font-size: 40px;
            }

            .moon {
                width: 74px;
                height: 74px;
                top: -26px;
                left: 22px;
            }
        }
    </style>
</head>

<body>
    <div class="success-page">
        <div class="moon"></div>

        <div class="success-card">
            <div class="success-icon">
                ✓
            </div>

            <h2 class="success-title">
                Thanh toán thành công!
            </h2>

            <p class="success-desc">
                Cảm ơn quý khách đã đặt bánh trung thu
                tại cửa hàng. Đơn hàng của bạn đã được
                ghi nhận thành công.
            </p>

            <div class="order-box">
                <p class="order-label">
                    Mã đơn hàng của bạn
                </p>

                <strong
                    class="order-code"
                    id="orderCode"
                >${orderCode}</strong>

                <br>

                <button
                    type="button"
                    class="copy-btn"
                    onclick="copyOrderCode()"
                >
                    Sao chép mã đơn
                </button>
            </div>

            <p class="note">
                Vui lòng lưu lại mã đơn này để nhắn
                CSKH khi cần hỗ trợ hoặc tra cứu
                trạng thái đơn hàng.
            </p>

            <a href="/" class="home-link">
                Về trang chủ
            </a>

            <p class="countdown-text">
                Tự động chuyển về trang chủ sau
                <span id="countdown">15</span>
                giây
            </p>
        </div>
    </div>

    <script>
        function copyOrderCode() {
            var orderCode =
                document.getElementById('orderCode').innerText;

            var button =
                document.querySelector('.copy-btn');

            function showCopied() {
                button.innerText = 'Đã sao chép!';

                setTimeout(function () {
                    button.innerText = 'Sao chép mã đơn';
                }, 1800);
            }

            if (
                navigator.clipboard &&
                window.isSecureContext
            ) {
                navigator.clipboard
                    .writeText(orderCode)
                    .then(showCopied)
                    .catch(function () {
                        fallbackCopy(orderCode);
                    });

                return;
            }

            fallbackCopy(orderCode);
        }

        function fallbackCopy(value) {
            var textarea =
                document.createElement('textarea');

            textarea.value = value;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';

            document.body.appendChild(textarea);

            textarea.focus();
            textarea.select();

            document.execCommand('copy');

            document.body.removeChild(textarea);

            var button =
                document.querySelector('.copy-btn');

            button.innerText = 'Đã sao chép!';

            setTimeout(function () {
                button.innerText = 'Sao chép mã đơn';
            }, 1800);
        }

        var seconds = 15;

        var countdownElement =
            document.getElementById('countdown');

        var timer = setInterval(function () {
            seconds -= 1;

            countdownElement.innerText = seconds;

            if (seconds <= 0) {
                clearInterval(timer);
                window.location.href = '/';
            }
        }, 1000);
    </script>
</body>
</html>
    `;
}

/* =====================================================
   TẠO ĐƠN HÀNG
===================================================== */

exports.createOrder = async (req, res) => {
    try {
        const orderData = {
            ...req.body
        };

        const totalAmount = calcOrderTotal(orderData);

        if (
            !Number.isFinite(totalAmount) ||
            totalAmount <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'Tổng tiền đơn hàng không hợp lệ'
            });
        }

        const orderCode = createOrderCode();

        const paymentMethod = String(
            orderData.paymentMethod || 'COD'
        ).toUpperCase();

        orderData.totalAmount = totalAmount;
        orderData.orderCode = orderCode;
        orderData.paymentMethod = paymentMethod;

        /*
         * Với VNPay:
         * lưu đơn vào MongoDB trước khi chuyển khách sang VNPay.
         */
        if (paymentMethod === 'VNPAY') {
            const pendingOrder = new Order({
                ...orderData,

                orderCode,
                totalAmount,

                paymentMethod: 'VNPAY',
                paymentStatus: 'PENDING',
                orderStatus: 'NEW',

                vnpayTxnRef: orderCode
            });

            await pendingOrder.save();

            const paymentUrl =
                vnpayService.createPaymentUrl(
                    {
                        txnRef: orderCode,
                        totalAmount
                    },
                    getClientIp(req)
                );

            return res.status(200).json({
                success: true,
                message:
                    'Đơn chờ thanh toán đã được tạo',

                paymentUrl,
                orderCode,
                orderId: pendingOrder._id
            });
        }

        /*
         * Đơn COD
         */
        const newOrder = new Order({
            ...orderData,

            orderCode,
            totalAmount,

            paymentMethod: 'COD',
            paymentStatus: 'PENDING',
            orderStatus: 'NEW'
        });

        await newOrder.save();

        sendTelegramNotification(newOrder);

        return res.status(201).json({
            success: true,
            message: 'Đặt hàng thành công!',
            orderCode: newOrder.orderCode,
            orderId: newOrder._id
        });
    } catch (error) {
        console.error('Lỗi createOrder:', error);

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                'Không thể tạo đơn hàng'
        });
    }
};

/* =====================================================
   LẤY DANH SÁCH ĐƠN
===================================================== */

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({
            createdAt: -1
        });

        return res.status(200).json({
            success: true,
            orders
        });
    } catch (error) {
        console.error('Lỗi getOrders:', error);

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                'Không thể lấy danh sách đơn hàng'
        });
    }
};

/* =====================================================
   VNPAY RETURN URL
===================================================== */

exports.vnpayReturn = async (req, res) => {
    try {
        console.log(
            'Đã nhận VNPay Return:',
            req.query
        );

        const isValid = verifyVnpayChecksum(
            req.query
        );

        if (!isValid) {
            return res.status(400).send(
                renderMessagePage({
                    title: 'Thanh toán không hợp lệ',
                    message:
                        'Chữ ký VNPay không hợp lệ hoặc dữ liệu giao dịch đã bị thay đổi.',
                    color: '#a71919',
                    redirectSeconds: 4
                })
            );
        }

        const txnRef = String(
            req.query.vnp_TxnRef || ''
        ).trim();

        const responseCode = String(
            req.query.vnp_ResponseCode || ''
        );

        const transactionStatus = String(
            req.query.vnp_TransactionStatus || ''
        );

        if (!txnRef) {
            return res.status(400).send(
                renderMessagePage({
                    title: 'Thiếu mã giao dịch',
                    message:
                        'VNPay không trả về mã tham chiếu đơn hàng.',
                    redirectSeconds: 4
                })
            );
        }

        const order = await findOrderByTxnRef(
            txnRef
        );

        if (!order) {
            return res.status(404).send(
                renderMessagePage({
                    title:
                        'Không tìm thấy đơn hàng',

                    message:
                        `Không tìm thấy đơn hàng có mã ${txnRef}. Vui lòng liên hệ CSKH để được kiểm tra.`,

                    redirectSeconds: 6
                })
            );
        }

        if (!isVnpayAmountValid(order, req.query)) {
            return res.status(400).send(
                renderMessagePage({
                    title:
                        'Số tiền không hợp lệ',

                    message:
                        'Số tiền VNPay trả về không trùng với tổng tiền của đơn hàng.',

                    redirectSeconds: 5
                })
            );
        }

        if (
            responseCode === '00' &&
            transactionStatus === '00'
        ) {
            const result =
                await confirmPaidVnpayOrder(
                    txnRef,
                    req.query
                );

            if (!result.order) {
                return res.status(404).send(
                    renderMessagePage({
                        title:
                            'Không tìm thấy đơn hàng',

                        message:
                            'Không thể xác định đơn hàng tương ứng với giao dịch VNPay.',

                        redirectSeconds: 5
                    })
                );
            }

            return res.status(200).send(
                renderSuccessPage(result.order)
            );
        }

        await markVnpayPaymentFailed(
            txnRef,
            req.query
        );

        return res.status(200).send(
            renderMessagePage({
                title:
                    'Thanh toán chưa thành công',

                message:
                    `Giao dịch đã bị hủy hoặc không thành công. Mã VNPay: ${responseCode}.`,

                redirectSeconds: 5
            })
        );
    } catch (error) {
        console.error('Lỗi vnpayReturn:', error);

        return res.status(500).send(
            renderMessagePage({
                title:
                    'Lỗi xử lý thanh toán',

                message:
                    'Máy chủ chưa thể xử lý kết quả giao dịch. Vui lòng liên hệ CSKH để được hỗ trợ.',

                redirectSeconds: 6
            })
        );
    }
};

/* =====================================================
   VNPAY IPN URL
===================================================== */

exports.vnpayIpn = async (req, res) => {
    try {
        console.log(
            'Đã nhận VNPay IPN:',
            req.query
        );

        const isValid = verifyVnpayChecksum(
            req.query
        );

        if (!isValid) {
            return res.status(200).json({
                RspCode: '97',
                Message: 'Invalid checksum'
            });
        }

        const txnRef = String(
            req.query.vnp_TxnRef || ''
        ).trim();

        const responseCode = String(
            req.query.vnp_ResponseCode || ''
        );

        const transactionStatus = String(
            req.query.vnp_TransactionStatus || ''
        );

        if (!txnRef) {
            return res.status(200).json({
                RspCode: '01',
                Message: 'Order not found'
            });
        }

        const order = await findOrderByTxnRef(
            txnRef
        );

        if (!order) {
            return res.status(200).json({
                RspCode: '01',
                Message: 'Order not found'
            });
        }

        if (!isVnpayAmountValid(order, req.query)) {
            return res.status(200).json({
                RspCode: '04',
                Message: 'Invalid amount'
            });
        }

        if (order.paymentStatus === 'PAID') {
            return res.status(200).json({
                RspCode: '02',
                Message: 'Order already confirmed'
            });
        }

        if (
            responseCode === '00' &&
            transactionStatus === '00'
        ) {
            const result =
                await confirmPaidVnpayOrder(
                    txnRef,
                    req.query
                );

            if (!result.order) {
                return res.status(200).json({
                    RspCode: '01',
                    Message: 'Order not found'
                });
            }

            if (!result.newlyPaid) {
                return res.status(200).json({
                    RspCode: '02',
                    Message: 'Order already confirmed'
                });
            }

            return res.status(200).json({
                RspCode: '00',
                Message: 'Confirm success'
            });
        }

        await markVnpayPaymentFailed(
            txnRef,
            req.query
        );

        return res.status(200).json({
            RspCode: '00',
            Message: 'Payment failed'
        });
    } catch (error) {
        console.error('Lỗi vnpayIpn:', error);

        return res.status(200).json({
            RspCode: '99',
            Message: 'Unknown error'
        });
    }
};
