const crypto = require('crypto');
const express = require('express');

const Payment = require('../models/Payment');
const Order = require('../models/Order');
const {
    createBankQrUrl
} = require('../services/bankQrService');
const {
    countOrderSalesOnce
} = require('../services/productSalesService');
const telegramService = require('../services/telegramService');

const router = express.Router();
const ORDER_CODE_PATTERN = /(?:MH|PAY)\d{8}[A-Z0-9]{6}/i;

function cleanText(value, maxLength) {
    return String(value || '')
        .trim()
        .slice(0, maxLength);
}

function safeEqual(left, right) {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));

    return a.length === b.length &&
        crypto.timingSafeEqual(a, b);
}

function isAuthorizedSePayWebhook(req) {
    const apiKey = String(
        process.env.SEPAY_WEBHOOK_API_KEY || ''
    ).trim();

    if (!apiKey) {
        return false;
    }

    const authorization = String(
        req.get('authorization') || ''
    ).trim();

    const xApiKey = String(
        req.get('x-api-key') || ''
    ).trim();

    return (
        safeEqual(authorization, `Apikey ${apiKey}`) ||
        safeEqual(xApiKey, apiKey)
    );
}

function extractOrderCode(payload) {
    const candidates = [
        payload.code,
        payload.content,
        payload.description
    ]
        .filter(Boolean)
        .map(String);

    for (const candidate of candidates) {
        const match = candidate
            .toUpperCase()
            .match(ORDER_CODE_PATTERN);

        if (match) {
            return match[0];
        }
    }

    return '';
}

async function markExpired(payment) {
    if (
        payment.status === 'PENDING' &&
        payment.expiresAt.getTime() <= Date.now()
    ) {
        payment.status = 'EXPIRED';
        await payment.save();

        await Order.updateOne(
            {
                _id: payment.order,
                paymentStatus: 'PENDING'
            },
            {
                $set: {
                    paymentStatus: 'FAILED'
                }
            }
        );
    }

    return payment;
}

async function sendOrderNotificationOnce(payment, order) {
    if (payment.notifiedAt || !order) {
        return;
    }

    try {
        await telegramService.sendOrderNotification(order);
        payment.notifiedAt = new Date();
        await payment.save();
    } catch (error) {
        console.error(
            'Không gửi được Telegram cho chuyển khoản:',
            error.message
        );
    }
}

async function confirmPaidOrder(payment, payload) {
    const transactionId = cleanText(payload.id, 100);

    if (payment.status !== 'PAID') {
        payment.status = 'PAID';
        payment.gatewayTransactionId = transactionId;
        payment.gatewayReferenceCode = cleanText(
            payload.referenceCode,
            160
        );
        payment.gatewayBankCode = cleanText(
            payload.gateway,
            100
        );

        const transactionDate = payload.transactionDate
            ? new Date(
                String(payload.transactionDate)
                    .replace(' ', 'T') + '+07:00'
            )
            : new Date();

        payment.paidAt = Number.isNaN(
            transactionDate.getTime()
        )
            ? new Date()
            : transactionDate;

        await payment.save();
    }

    const order = await Order.findOneAndUpdate(
        {
            _id: payment.order,
            paymentMethod: 'BANK_TRANSFER'
        },
        {
            $set: {
                paymentStatus: 'PAID',
                orderStatus: 'CONFIRMED',
                bankTransferContent: payment.transferContent,
                bankTransactionId:
                    payment.gatewayTransactionId,
                bankReferenceCode:
                    payment.gatewayReferenceCode,
                bankGatewayCode:
                    payment.gatewayBankCode,
                bankPaidAt: payment.paidAt || new Date()
            }
        },
        {
            new: true
        }
    );

    if (order) {
        await countOrderSalesOnce(
            Order,
            order._id
        );

        await sendOrderNotificationOnce(
            payment,
            order
        );
    }

    return order;
}

router.post('/sepay-webhook', async (req, res) => {
    try {
        if (!isAuthorizedSePayWebhook(req)) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        const payload = req.body || {};
        const transactionId = cleanText(
            payload.id,
            100
        );
        const transferType = cleanText(
            payload.transferType,
            20
        ).toLowerCase();
        const transferAmount = Number(
            payload.transferAmount
        );
        const receivedAccount = cleanText(
            payload.accountNumber,
            100
        );
        const orderCode = extractOrderCode(payload);

        if (
            !transactionId ||
            transferType !== 'in' ||
            !Number.isFinite(transferAmount)
        ) {
            return res.status(200).json({
                success: true
            });
        }

        const duplicated = await Payment.findOne({
            gatewayTransactionId: transactionId
        });

        if (duplicated) {
            await confirmPaidOrder(
                duplicated,
                payload
            );

            return res.status(200).json({
                success: true
            });
        }

        if (!orderCode) {
            console.warn(
                'SePay webhook không tìm thấy mã đơn:',
                payload
            );

            return res.status(200).json({
                success: true
            });
        }

        const payment = await Payment.findOne({
            orderCode
        });

        if (!payment) {
            console.warn(
                `Không tìm thấy giao dịch ${orderCode}`
            );

            return res.status(200).json({
                success: true
            });
        }

        const expectedAccount = String(
            process.env.BANK_ACCOUNT_NUMBER || ''
        ).trim();

        const accountMatches =
            !expectedAccount ||
            !receivedAccount ||
            receivedAccount === expectedAccount;

        const amountMatches =
            Number(payment.amount) === transferAmount;

        if (!accountMatches || !amountMatches) {
            console.warn(
                'Giao dịch SePay không khớp đơn hàng',
                {
                    orderCode,
                    expectedAmount: payment.amount,
                    transferAmount,
                    expectedAccount,
                    receivedAccount
                }
            );

            return res.status(200).json({
                success: true
            });
        }

        await confirmPaidOrder(payment, payload);

        return res.status(200).json({
            success: true
        });
    } catch (error) {
        console.error(
            'SePay webhook error:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/:orderCode/cancel', async (req, res, next) => {
    try {
        const orderCode = String(
            req.params.orderCode || ''
        )
            .trim()
            .toUpperCase();

        const payment = await Payment.findOne({
            orderCode
        });

        if (!payment) {
            return res.status(404).json({
                message: 'Không tìm thấy giao dịch.'
            });
        }

        if (payment.status === 'PENDING') {
            payment.status = 'CANCELLED';
            await payment.save();

            await Order.updateOne(
                {
                    _id: payment.order,
                    paymentStatus: 'PENDING'
                },
                {
                    $set: {
                        paymentStatus: 'FAILED'
                    }
                }
            );
        }

        return res.json({
            orderCode: payment.orderCode,
            status: payment.status
        });
    } catch (error) {
        return next(error);
    }
});

router.get('/:orderCode', async (req, res, next) => {
    try {
        const orderCode = String(
            req.params.orderCode || ''
        )
            .trim()
            .toUpperCase();

        let payment = await Payment.findOne({
            orderCode
        });

        if (!payment) {
            return res.status(404).json({
                message: 'Không tìm thấy giao dịch.'
            });
        }

        payment = await markExpired(payment);

        return res.json({
            orderCode: payment.orderCode,
            customerName: payment.customerName,
            description: payment.description,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            bankName: payment.bankName,
            bankAccountNumber:
                payment.bankAccountNumber,
            bankAccountName:
                payment.bankAccountName,
            transferContent:
                payment.transferContent,
            qrUrl: createBankQrUrl({
                amount: payment.amount,
                transferContent:
                    payment.transferContent
            }),
            paidAt: payment.paidAt,
            expiresAt: payment.expiresAt,
            createdAt: payment.createdAt
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
