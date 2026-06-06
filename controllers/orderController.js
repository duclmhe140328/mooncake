const crypto = require('crypto');
const qs = require('qs');
const Order = require('../models/Order');
const telegramService = require('../services/telegramService');
const vnpayService = require('../services/vnpayService');

const pendingVnpayOrders = new Map();
const paidVnpayOrders = new Map();

function createOrderCode() {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();

    return `MH${datePart}${randomPart}`;
}

function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();

    keys.forEach((key) => {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    });

    return sorted;
}

function verifyVnpayChecksum(query) {
    const secretKey = String(process.env.VNP_HASH_SECRET || '').trim();

    const vnpParams = { ...query };
    const secureHash = vnpParams.vnp_SecureHash;

    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    const sortedParams = sortObject(vnpParams);
    const signData = qs.stringify(sortedParams, { encode: false });

    const checkHash = crypto
        .createHmac('sha512', secretKey)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');

    return secureHash === checkHash;
}

function getClientIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        '127.0.0.1'
    );
}

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

async function savePaidVnpayOrder(txnRef, vnpayQuery) {
    if (paidVnpayOrders.has(txnRef)) {
        return await Order.findById(paidVnpayOrders.get(txnRef));
    }

    const pendingData = pendingVnpayOrders.get(txnRef);

    if (!pendingData) {
        return null;
    }

    const orderData = pendingData.orderData;

    const newOrder = new Order({
        ...orderData,
        orderCode: orderData.orderCode || txnRef,
        paymentMethod: 'VNPAY',
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        vnpayTxnRef: txnRef,
        vnpayTransactionNo: vnpayQuery.vnp_TransactionNo || '',
        vnpayBankCode: vnpayQuery.vnp_BankCode || '',
        vnpayPayDate: vnpayQuery.vnp_PayDate || ''
    });

    await newOrder.save();

    paidVnpayOrders.set(txnRef, newOrder._id.toString());
    pendingVnpayOrders.delete(txnRef);

    telegramService.sendOrderNotification(newOrder).catch((error) => {
        console.error('Lỗi gửi Telegram:', error.message);
    });

    return newOrder;
}

exports.createOrder = async (req, res) => {
    try {
        const orderData = req.body;
        const totalAmount = calcOrderTotal(orderData);

        if (!totalAmount || totalAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Tổng tiền đơn hàng không hợp lệ'
            });
        }

        const orderCode = createOrderCode();

        orderData.totalAmount = totalAmount;
        orderData.orderCode = orderCode;

        if (orderData.paymentMethod === 'VNPAY') {
            pendingVnpayOrders.set(orderCode, {
                orderData,
                createdAt: Date.now()
            });

            const paymentUrl = vnpayService.createPaymentUrl(
                {
                    txnRef: orderCode,
                    totalAmount
                },
                getClientIp(req)
            );

            return res.status(200).json({
                success: true,
                paymentUrl,
                orderCode
            });
        }

        const newOrder = new Order({
            ...orderData,
            paymentMethod: orderData.paymentMethod || 'COD',
            paymentStatus: 'PENDING',
            orderStatus: 'NEW'
        });

        await newOrder.save();

        telegramService.sendOrderNotification(newOrder).catch((error) => {
            console.error('Lỗi gửi Telegram:', error.message);
        });

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
            error: error.message
        });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            orders
        });
    } catch (error) {
        console.error('Lỗi getOrders:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

exports.vnpayReturn = async (req, res) => {
    try {
        const isValid = verifyVnpayChecksum(req.query);

        if (!isValid) {
            return res.status(400).send(`
                <h2 style="text-align:center;color:red;margin-top:50px;">
                    Thanh toán không hợp lệ
                </h2>
                <p style="text-align:center;">Sai chữ ký VNPAY.</p>
                <script>
                    setTimeout(() => window.location.href = "/", 3000);
                </script>
            `);
        }

        const txnRef = req.query.vnp_TxnRef;
        const responseCode = req.query.vnp_ResponseCode;
        const transactionStatus = req.query.vnp_TransactionStatus;

        if (responseCode === '00' && transactionStatus === '00') {
            const savedOrder = await savePaidVnpayOrder(txnRef, req.query);

            if (!savedOrder) {
                return res.status(400).send(`
                    <h2 style="text-align:center;color:red;margin-top:50px;">
                        Không tìm thấy đơn chờ thanh toán
                    </h2>
                    <p style="text-align:center;">
                        Có thể server đã restart hoặc giao dịch đã quá hạn.
                    </p>
                    <script>
                        setTimeout(() => window.location.href = "/", 4000);
                    </script>
                `);
            }

            return res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Thanh toán thành công</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, "Segoe UI", sans-serif;
            background:
                radial-gradient(circle at top left, rgba(255, 220, 145, 0.45), transparent 32%),
                radial-gradient(circle at bottom right, rgba(120, 20, 15, 0.38), transparent 40%),
                linear-gradient(135deg, #fff8e8 0%, #f6ddb2 45%, #8b1d16 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 22px;
            color: #4b261c;
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
            width: 88px;
            height: 88px;
            border-radius: 50%;
            background: radial-gradient(circle at 35% 35%, #fff8dc, #ffd46d 68%, #d39b35);
            box-shadow: 0 0 35px rgba(255, 214, 109, 0.85);
            z-index: 1;
        }

        .success-card {
            position: relative;
            overflow: hidden;
            background: rgba(255, 250, 238, 0.97);
            border: 1px solid rgba(214, 168, 79, 0.65);
            border-radius: 30px;
            padding: 44px 28px 34px;
            text-align: center;
            box-shadow:
                0 26px 65px rgba(72, 20, 15, 0.28),
                inset 0 0 0 1px rgba(255, 255, 255, 0.72);
            animation: fadeUp 0.55s ease forwards;
            z-index: 2;
        }

        .success-card::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
                radial-gradient(circle at 50% -10%, rgba(255, 213, 122, 0.42), transparent 34%),
                linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
            pointer-events: none;
        }

        .success-card::after {
            content: "月";
            position: absolute;
            right: -12px;
            bottom: -42px;
            font-size: 150px;
            line-height: 1;
            font-weight: 900;
            color: rgba(139, 29, 22, 0.055);
            pointer-events: none;
        }

        .success-icon {
            width: 88px;
            height: 88px;
            margin: 0 auto 20px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ffe08a, #c8902f);
            color: #7a1710;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 46px;
            font-weight: 900;
            box-shadow:
                0 13px 30px rgba(184, 134, 11, 0.35),
                inset 0 2px 4px rgba(255, 255, 255, 0.72);
            position: relative;
            z-index: 2;
        }

        .success-title {
            margin: 0 0 12px;
            color: #7c1811;
            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.4px;
            position: relative;
            z-index: 2;
        }

        .success-desc {
            margin: 0 auto 24px;
            max-width: 420px;
            color: #755139;
            font-size: 16px;
            line-height: 1.65;
            position: relative;
            z-index: 2;
        }

        .order-box {
            margin: 24px auto 20px;
            padding: 20px 16px;
            border-radius: 22px;
            background: linear-gradient(135deg, #fff4d4, #ffe3a1);
            border: 1px dashed rgba(139, 29, 22, 0.48);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
            position: relative;
            z-index: 2;
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
            text-shadow: 0 1px 0 rgba(255,255,255,0.85);
            user-select: all;
        }

        .copy-btn {
            margin-top: 15px;
            border: none;
            cursor: pointer;
            padding: 12px 20px;
            border-radius: 999px;
            background: linear-gradient(135deg, #8b1d16, #bd3a28);
            color: #fff8df;
            font-size: 14px;
            font-weight: 800;
            box-shadow: 0 11px 24px rgba(139, 29, 22, 0.30);
            transition: 0.2s ease;
        }

        .copy-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 32px rgba(139, 29, 22, 0.38);
        }

        .note {
            margin: 16px auto 26px;
            color: #66432e;
            font-size: 15px;
            line-height: 1.65;
            position: relative;
            z-index: 2;
        }

        .home-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 225px;
            height: 50px;
            padding: 0 24px;
            border-radius: 999px;
            background: linear-gradient(135deg, #d6a03c, #f5d47b);
            color: #681711;
            font-size: 15px;
            font-weight: 900;
            text-decoration: none;
            box-shadow: 0 13px 28px rgba(184, 134, 11, 0.30);
            transition: 0.2s ease;
            position: relative;
            z-index: 2;
        }

        .home-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 17px 36px rgba(184, 134, 11, 0.38);
        }

        .countdown-text {
            margin: 18px 0 0;
            color: #8b6135;
            font-size: 13px;
            position: relative;
            z-index: 2;
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
            <div class="success-icon">✓</div>

            <h2 class="success-title">Thanh toán thành công!</h2>

            <p class="success-desc">
                Cảm ơn quý khách đã đặt bánh trung thu tại cửa hàng.
                Đơn hàng của bạn đã được ghi nhận thành công.
            </p>

            <div class="order-box">
                <p class="order-label">Mã đơn hàng của bạn</p>

                <strong class="order-code" id="orderCode">${savedOrder.orderCode}</strong>

                <br />

                <button type="button" class="copy-btn" onclick="copyOrderCode()">
                    Sao chép mã đơn
                </button>
            </div>

            <p class="note">
                Vui lòng lưu lại mã đơn này để nhắn CSKH khi cần hỗ trợ hoặc tra cứu trạng thái đơn hàng.
            </p>

            <a href="/" class="home-link">
                Về trang chủ
            </a>

            <p class="countdown-text">
                Tự động chuyển về trang chủ sau <span id="countdown">15</span> giây
            </p>
        </div>
    </div>

    <script>
        function copyOrderCode() {
            var orderCode = document.getElementById("orderCode").innerText;
            var btn = document.querySelector(".copy-btn");

            if (navigator.clipboard) {
                navigator.clipboard.writeText(orderCode).then(function () {
                    btn.innerText = "Đã sao chép!";
                    setTimeout(function () {
                        btn.innerText = "Sao chép mã đơn";
                    }, 1800);
                });
            } else {
                var textarea = document.createElement("textarea");
                textarea.value = orderCode;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);

                btn.innerText = "Đã sao chép!";
                setTimeout(function () {
                    btn.innerText = "Sao chép mã đơn";
                }, 1800);
            }
        }

        var seconds = 15;
        var countdownEl = document.getElementById("countdown");

        var timer = setInterval(function () {
            seconds--;
            countdownEl.innerText = seconds;

            if (seconds <= 0) {
                clearInterval(timer);
                window.location.href = "/";
            }
        }, 1000);
    </script>
</body>
</html>
`);
        }

        pendingVnpayOrders.delete(txnRef);

        return res.send(`
            <h2 style="text-align:center;color:red;margin-top:50px;">
                Thanh toán thất bại hoặc đã bị hủy!
            </h2>
            <p style="text-align:center;">Đơn hàng chưa được ghi nhận.</p>
            <p style="text-align:center;">Mã lỗi VNPAY: ${responseCode}</p>
            <script>
                setTimeout(() => window.location.href = "/", 3000);
            </script>
        `);
    } catch (error) {
        console.error('Lỗi vnpayReturn:', error);

        return res.status(500).send('Lỗi xử lý kết quả thanh toán');
    }
};

exports.vnpayIpn = async (req, res) => {
    try {
        const isValid = verifyVnpayChecksum(req.query);

        if (!isValid) {
            return res.status(200).json({
                RspCode: '97',
                Message: 'Invalid checksum'
            });
        }

        const txnRef = req.query.vnp_TxnRef;
        const responseCode = req.query.vnp_ResponseCode;
        const transactionStatus = req.query.vnp_TransactionStatus;
        const amountFromVnpay = Number(req.query.vnp_Amount) / 100;

        const pendingData = pendingVnpayOrders.get(txnRef);

        if (!pendingData && !paidVnpayOrders.has(txnRef)) {
            return res.status(200).json({
                RspCode: '01',
                Message: 'Order not found'
            });
        }

        if (paidVnpayOrders.has(txnRef)) {
            return res.status(200).json({
                RspCode: '02',
                Message: 'Order already confirmed'
            });
        }

        const expectedAmount = Number(pendingData.orderData.totalAmount);

        if (expectedAmount !== amountFromVnpay) {
            pendingVnpayOrders.delete(txnRef);

            return res.status(200).json({
                RspCode: '04',
                Message: 'Invalid amount'
            });
        }

        if (responseCode === '00' && transactionStatus === '00') {
            const savedOrder = await savePaidVnpayOrder(txnRef, req.query);

            if (!savedOrder) {
                return res.status(200).json({
                    RspCode: '01',
                    Message: 'Order not found'
                });
            }

            return res.status(200).json({
                RspCode: '00',
                Message: 'Confirm success'
            });
        }

        pendingVnpayOrders.delete(txnRef);

        return res.status(200).json({
            RspCode: '00',
            Message: 'Payment failed, order not saved'
        });
    } catch (error) {
        console.error('Lỗi vnpayIpn:', error);

        return res.status(200).json({
            RspCode: '99',
            Message: 'Unknown error'
        });
    }
};

setInterval(() => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;

    for (const [txnRef, data] of pendingVnpayOrders.entries()) {
        if (now - data.createdAt > maxAge) {
            pendingVnpayOrders.delete(txnRef);
        }
    }
}, 5 * 60 * 1000);