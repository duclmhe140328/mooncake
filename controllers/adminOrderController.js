const mongoose = require('mongoose');

const Order = require('../models/Order');
const {
    countOrderSalesOnce,
    rebuildProductSalesFromOrders
} = require('../services/productSalesService');

const PAYMENT_STATUSES = new Set([
    'PENDING',
    'PAID',
    'FAILED',
    'REFUNDED'
]);

const ORDER_STATUSES = new Set([
    'NEW',
    'CONFIRMED',
    'PACKING',
    'SHIPPING',
    'DELIVERED',
    'CANCELLED'
]);

function escapeRegex(value) {
    return String(value || '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStatus(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

exports.getOrders = async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(
                5,
                Number.parseInt(req.query.limit, 10) || 10
            )
        );

        const filter = {};

        const paymentMethod = normalizeStatus(
            req.query.paymentMethod
        );

        const paymentStatus = normalizeStatus(
            req.query.paymentStatus
        );

        const orderStatus = normalizeStatus(
            req.query.orderStatus
        );

        const search = String(
            req.query.search || ''
        ).trim();

        if (['COD', 'VNPAY', 'BANK_TRANSFER'].includes(paymentMethod)) {
            filter.paymentMethod = paymentMethod;
        }

        if (PAYMENT_STATUSES.has(paymentStatus)) {
            filter.paymentStatus = paymentStatus;
        }

        if (ORDER_STATUSES.has(orderStatus)) {
            filter.orderStatus = orderStatus;
        }

        if (search) {
            const regex = new RegExp(
                escapeRegex(search),
                'i'
            );

            filter.$or = [
                {
                    orderCode: regex
                },
                {
                    customerName: regex
                },
                {
                    phone: regex
                },
                {
                    address: regex
                }
            ];
        }

        const total = await Order.countDocuments(filter);
        const pages = Math.max(
            1,
            Math.ceil(total / limit)
        );
        const safePage = Math.min(page, pages);

        const orders = await Order.find(filter)
            .sort({
                createdAt: -1
            })
            .skip((safePage - 1) * limit)
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            orders,
            pagination: {
                page: safePage,
                limit,
                total,
                pages,
                hasPrev: safePage > 1,
                hasNext: safePage < pages
            }
        });
    } catch (error) {
        console.error(
            'admin getOrders error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                'Không thể tải danh sách đơn hàng.'
        });
    }
};

exports.updateCodStatus = async (req, res) => {
    try {
        const orderId = String(
            req.params.id || ''
        );

        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'Mã đơn hàng không hợp lệ.'
            });
        }

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đơn hàng.'
            });
        }

        if (
            String(order.paymentMethod || '')
                .toUpperCase() !== 'COD'
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Trạng thái thanh toán trực tuyến được cập nhật tự động, không sửa thủ công tại đây.'
            });
        }

        const paymentStatus = normalizeStatus(
            req.body.paymentStatus ||
            order.paymentStatus
        );

        const orderStatus = normalizeStatus(
            req.body.orderStatus ||
            order.orderStatus
        );

        if (!PAYMENT_STATUSES.has(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message:
                    'Trạng thái thanh toán không hợp lệ.'
            });
        }

        if (!ORDER_STATUSES.has(orderStatus)) {
            return res.status(400).json({
                success: false,
                message:
                    'Trạng thái đơn hàng không hợp lệ.'
            });
        }

        const wasCountedSuccessfulCod = (
            order.salesCounted === true &&
            String(order.orderStatus || '').toUpperCase() === 'DELIVERED'
        );

        order.paymentStatus =
            orderStatus === 'DELIVERED'
                ? 'PAID'
                : paymentStatus;

        order.orderStatus = orderStatus;

        await order.save();

        if (
            order.orderStatus === 'DELIVERED' &&
            order.paymentStatus === 'PAID'
        ) {
            await countOrderSalesOnce(
                Order,
                order._id
            );
        } else if (wasCountedSuccessfulCod) {
            // Nếu admin sửa một đơn đã giao về trạng thái khác,
            // tính lại toàn bộ để soldCount không bị giữ sai.
            await rebuildProductSalesFromOrders(Order);
        }

        return res.status(200).json({
            success: true,
            message:
                order.orderStatus === 'DELIVERED'
                    ? 'Đã xác nhận khách nhận hàng, cập nhật thanh toán và lượt bán.'
                    : 'Đã cập nhật trạng thái đơn COD.',
            order
        });
    } catch (error) {
        console.error(
            'updateCodStatus error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                'Không thể cập nhật trạng thái đơn hàng.'
        });
    }
};

exports.rebuildSales = async (req, res) => {
    try {
        const result =
            await rebuildProductSalesFromOrders(Order);

        return res.status(200).json({
            success: true,
            message:
                'Đã đồng bộ lại lượt bán từ các đơn thành công.',
            result
        });
    } catch (error) {
        console.error(
            'rebuildSales error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                'Không thể đồng bộ lượt bán.'
        });
    }
};
