const Payment = require('../models/Payment');
const {
    getBankConfig
} = require('./bankQrService');

function getTimeoutMinutes() {
    const value = Number(
        process.env.PAYMENT_TIMEOUT_MINUTES || 15
    );

    return Number.isFinite(value) && value >= 2 && value <= 120
        ? value
        : 15;
}

function normalizeIp(value) {
    const first = String(value || '')
        .split(',')[0]
        .trim();

    if (first === '::1') {
        return '127.0.0.1';
    }

    return first.replace(/^::ffff:/, '') || '127.0.0.1';
}

function buildPaymentDescription(order) {
    const count = Array.isArray(order.products)
        ? order.products.reduce((sum, item) => {
            return sum + Number(item?.quantity || 1);
        }, 0)
        : 0;

    return `Thanh toán đơn ${order.orderCode}${
        count ? ` - ${count} sản phẩm` : ''
    }`.slice(0, 240);
}

async function createPendingBankPayment(order, request) {
    if (!order?._id || !order?.orderCode) {
        throw new Error(
            'Không thể tạo thanh toán khi chưa có đơn hàng.'
        );
    }

    const bank = getBankConfig();
    const timeoutMs = getTimeoutMinutes() * 60 * 1000;
    const transferContent = String(order.orderCode)
        .trim()
        .toUpperCase();

    const payment = await Payment.findOneAndUpdate(
        {
            orderCode: transferContent
        },
        {
            $setOnInsert: {
                order: order._id,
                orderCode: transferContent,
                customerName: order.customerName,
                phone: order.phone,
                description: buildPaymentDescription(order),
                amount: Number(order.totalAmount),
                currency: 'VND',
                gateway: 'BANK_TRANSFER_SEPAY',
                status: 'PENDING',
                bankName: bank.bankName,
                bankAccountNumber: bank.accountNumber,
                bankAccountName: bank.accountName,
                transferContent,
                expiresAt: new Date(Date.now() + timeoutMs),
                clientIp: normalizeIp(
                    request?.headers?.['x-forwarded-for'] ||
                    request?.socket?.remoteAddress
                )
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return payment;
}

module.exports = {
    createPendingBankPayment,
    getTimeoutMinutes
};
