const mongoose = require('mongoose');
const Product = require('../models/Product');

/**
 * Cộng lượt bán cho sản phẩm sau khi đơn hàng được xác nhận.
 *
 * Mỗi phần tử products nên có:
 * - catalogProductId: _id của Product trong MongoDB (ưu tiên)
 * - baseCode: mã sản phẩm gốc
 * - productId: mã biến thể
 * - quantity: số lượng
 */
async function increaseProductSales(products = []) {
    if (!Array.isArray(products) || products.length === 0) return;

    const grouped = new Map();

    for (const item of products) {
        const quantity = Math.max(0, Number(item?.quantity || 0));
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        const catalogProductId = String(item?.catalogProductId || '').trim();
        const baseCode = String(item?.baseCode || '').trim().toUpperCase();
        const variantCode = String(item?.productId || '').trim().toUpperCase();

        let key = '';
        let filter = null;

        if (mongoose.isValidObjectId(catalogProductId)) {
            key = `id:${catalogProductId}`;
            filter = { _id: catalogProductId };
        } else if (baseCode) {
            key = `code:${baseCode}`;
            filter = { code: baseCode };
        } else if (variantCode) {
            key = `variant:${variantCode}`;
            filter = { 'options.code': variantCode };
        }

        if (!filter) continue;

        const current = grouped.get(key);
        if (current) {
            current.quantity += quantity;
        } else {
            grouped.set(key, { filter, quantity });
        }
    }

    const operations = [...grouped.values()].map(item => ({
        updateOne: {
            filter: item.filter,
            update: { $inc: { soldCount: item.quantity } }
        }
    }));

    if (operations.length > 0) {
        await Product.bulkWrite(operations, { ordered: false });
    }
}

/**
 * Đánh dấu một đơn chỉ được cộng lượt bán đúng một lần.
 *
 * Order schema cần có:
 * salesCounted: { type: Boolean, default: false }
 */
async function countOrderSalesOnce(Order, orderId) {
    if (!Order || !orderId) return false;

    const claimedOrder = await Order.findOneAndUpdate(
        {
            _id: orderId,
            salesCounted: { $ne: true }
        },
        {
            $set: { salesCounted: true }
        },
        {
            new: true
        }
    );

    if (!claimedOrder) return false;

    try {
        await increaseProductSales(claimedOrder.products || []);
        return true;
    } catch (error) {
        // Cho phép thử lại nếu cộng lượt bán thất bại.
        await Order.updateOne(
            { _id: orderId },
            { $set: { salesCounted: false } }
        ).catch(() => {});

        throw error;
    }
}

module.exports = {
    increaseProductSales,
    countOrderSalesOnce
};
