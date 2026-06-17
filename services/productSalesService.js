const mongoose = require('mongoose');
const Product = require('../models/Product');

function normalizeCode(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function getSalesTarget(item) {
    const catalogProductId = String(
        item?.catalogProductId || ''
    ).trim();

    const baseCode = normalizeCode(
        item?.baseCode
    );

    const variantCode = normalizeCode(
        item?.productId
    );

    if (mongoose.isValidObjectId(catalogProductId)) {
        return {
            key: `id:${catalogProductId}`,
            filter: {
                _id: catalogProductId
            }
        };
    }

    if (baseCode) {
        return {
            key: `code:${baseCode}`,
            filter: {
                code: baseCode
            }
        };
    }

    if (variantCode) {
        return {
            key: `variant:${variantCode}`,
            filter: {
                'options.code': variantCode
            }
        };
    }

    return null;
}

function groupProductSales(products = []) {
    const grouped = new Map();

    if (!Array.isArray(products)) {
        return grouped;
    }

    for (const item of products) {
        const quantity = Number(item?.quantity || 0);

        if (
            !Number.isFinite(quantity) ||
            quantity <= 0
        ) {
            continue;
        }

        const target = getSalesTarget(item);

        if (!target) {
            continue;
        }

        const current = grouped.get(target.key);

        if (current) {
            current.quantity += quantity;
        } else {
            grouped.set(target.key, {
                filter: target.filter,
                quantity
            });
        }
    }

    return grouped;
}

async function increaseProductSales(products = []) {
    const grouped = groupProductSales(products);

    const operations = [...grouped.values()].map(item => ({
        updateOne: {
            filter: item.filter,
            update: {
                $inc: {
                    soldCount: item.quantity
                }
            }
        }
    }));

    if (!operations.length) {
        return {
            matched: 0,
            modified: 0
        };
    }

    const result = await Product.bulkWrite(
        operations,
        {
            ordered: false
        }
    );

    return {
        matched:
            result.matchedCount ??
            result.nMatched ??
            0,
        modified:
            result.modifiedCount ??
            result.nModified ??
            0
    };
}

async function countOrderSalesOnce(Order, orderId) {
    if (!Order || !orderId) {
        return false;
    }

    const claimedOrder = await Order.findOneAndUpdate(
        {
            _id: orderId,
            salesCounted: {
                $ne: true
            }
        },
        {
            $set: {
                salesCounted: true
            }
        },
        {
            new: true
        }
    );

    if (!claimedOrder) {
        return false;
    }

    try {
        await increaseProductSales(
            claimedOrder.products || []
        );

        return true;
    } catch (error) {
        await Order.updateOne(
            {
                _id: orderId
            },
            {
                $set: {
                    salesCounted: false
                }
            }
        ).catch(() => {});

        throw error;
    }
}

async function rebuildProductSalesFromOrders(Order) {
    if (!Order) {
        throw new Error(
            'Thiếu model Order để đồng bộ lượt bán.'
        );
    }

    const successfulOrders = await Order.find({
        $or: [
            {
                paymentMethod: {
                    $in: ['VNPAY', 'BANK_TRANSFER']
                },
                paymentStatus: 'PAID'
            },
            {
                paymentMethod: 'COD',
                orderStatus: 'DELIVERED'
            }
        ]
    })
        .select('_id products')
        .lean();

    const allProducts = successfulOrders.flatMap(order => {
        return Array.isArray(order.products)
            ? order.products
            : [];
    });

    await Product.updateMany(
        {},
        {
            $set: {
                soldCount: 0
            }
        }
    );

    await Order.updateMany(
        {},
        {
            $set: {
                salesCounted: false
            }
        }
    );

    const salesResult = await increaseProductSales(
        allProducts
    );

    const successfulOrderIds =
        successfulOrders.map(order => order._id);

    if (successfulOrderIds.length) {
        await Order.updateMany(
            {
                _id: {
                    $in: successfulOrderIds
                }
            },
            {
                $set: {
                    salesCounted: true
                }
            }
        );
    }

    return {
        ordersCounted: successfulOrders.length,
        productLines: allProducts.length,
        matchedProducts: salesResult.matched,
        modifiedProducts: salesResult.modified
    };
}

module.exports = {
    increaseProductSales,
    countOrderSalesOnce,
    rebuildProductSalesFromOrders
};
