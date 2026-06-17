const mongoose = require('mongoose');

const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');

function normalizeOrderCode(value) {
    return String(value || '')
        .trim()
        .replace(/^#+/, '')
        .toUpperCase();
}

function normalizePhone(value) {
    return String(value || '')
        .replace(/\D/g, '');
}

function samePhone(left, right) {
    const a = normalizePhone(left);
    const b = normalizePhone(right);

    if (!a || !b) {
        return false;
    }

    return a.slice(-9) === b.slice(-9);
}

function normalizeCode(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function orderContainsProduct(order, product) {
    const productId = String(product._id);
    const productCode = normalizeCode(product.code);

    const optionCodes = new Set(
        Array.isArray(product.options)
            ? product.options
                .map(option => normalizeCode(option?.code))
                .filter(Boolean)
            : []
    );

    return Array.isArray(order.products) &&
        order.products.some(item => {
            const catalogProductId = String(
                item?.catalogProductId || ''
            ).trim();

            const baseCode = normalizeCode(
                item?.baseCode
            );

            const variantCode = normalizeCode(
                item?.productId
            );

            return (
                catalogProductId === productId ||
                (
                    productCode &&
                    baseCode === productCode
                ) ||
                optionCodes.has(variantCode) ||
                (
                    productCode &&
                    variantCode === productCode
                )
            );
        });
}

function isReviewEligible(order) {
    const paymentMethod = String(
        order.paymentMethod || 'COD'
    ).toUpperCase();

    const paymentStatus = String(
        order.paymentStatus || ''
    ).toUpperCase();

    const orderStatus = String(
        order.orderStatus || ''
    ).toUpperCase();

    if (['VNPAY', 'BANK_TRANSFER'].includes(paymentMethod)) {
        return paymentStatus === 'PAID';
    }

    return [
        'DELIVERED',
        'RECEIVED',
        'COMPLETED'
    ].includes(orderStatus);
}

function serializeReview(review) {
    return {
        id: String(review._id),
        reviewerName: review.reviewerName,
        rating: review.rating,
        comment: review.comment,
        verifiedPurchase:
            review.verifiedPurchase === true,
        paymentMethod: review.paymentMethod,
        createdAt: review.createdAt
    };
}

async function getReviewSummary(productId) {
    const result = await Review.aggregate([
        {
            $match: {
                product: new mongoose.Types.ObjectId(productId),
                approved: true
            }
        },
        {
            $group: {
                _id: '$product',
                count: {
                    $sum: 1
                },
                average: {
                    $avg: '$rating'
                }
            }
        }
    ]);

    if (!result.length) {
        return {
            count: 0,
            average: 0
        };
    }

    return {
        count: Number(result[0].count || 0),
        average: Number(
            Number(result[0].average || 0)
                .toFixed(1)
        )
    };
}

exports.getProductReviews = async (req, res) => {
    try {
        const productId = String(
            req.params.productId || ''
        );

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Mã sản phẩm không hợp lệ.'
            });
        }

        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            30,
            Math.max(
                1,
                Number.parseInt(req.query.limit, 10) || 10
            )
        );

        const filter = {
            product: productId,
            approved: true
        };

        const [reviews, total, summary] = await Promise.all([
            Review.find(filter)
                .sort({
                    createdAt: -1
                })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Review.countDocuments(filter),
            getReviewSummary(productId)
        ]);

        return res.status(200).json({
            success: true,
            reviews: reviews.map(serializeReview),
            summary,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(
                    1,
                    Math.ceil(total / limit)
                )
            }
        });
    } catch (error) {
        console.error(
            'getProductReviews error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                'Không thể tải đánh giá.'
        });
    }
};

exports.createReview = async (req, res) => {
    try {
        const productId = String(
            req.body.productId || ''
        );

        const orderCode = normalizeOrderCode(
            req.body.orderCode
        );

        const phone = normalizePhone(
            req.body.phone
        );

        const rating = Number(
            req.body.rating
        );

        const comment = String(
            req.body.comment || ''
        ).trim();

        const reviewerName = String(
            req.body.reviewerName || ''
        ).trim();

        if (!mongoose.isValidObjectId(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Mã sản phẩm không hợp lệ.'
            });
        }

        if (!orderCode || phone.length < 9) {
            return res.status(400).json({
                success: false,
                message:
                    'Vui lòng nhập đúng mã đơn hàng và số điện thoại đặt hàng.'
            });
        }

        if (
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {
            return res.status(400).json({
                success: false,
                message: 'Điểm đánh giá phải từ 1 đến 5 sao.'
            });
        }

        if (
            comment.length < 10 ||
            comment.length > 1200
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Nội dung đánh giá cần từ 10 đến 1.200 ký tự.'
            });
        }

        const [product, order] = await Promise.all([
            Product.findOne({
                _id: productId,
                active: {
                    $ne: false
                }
            }).lean(),
            Order.findOne({
                orderCode
            }).lean()
        ]);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm.'
            });
        }

        if (!order || !samePhone(order.phone, phone)) {
            return res.status(404).json({
                success: false,
                message:
                    'Không tìm thấy đơn hàng khớp với mã đơn và số điện thoại.'
            });
        }

        if (!orderContainsProduct(order, product)) {
            return res.status(403).json({
                success: false,
                message:
                    'Đơn hàng này không chứa sản phẩm đang đánh giá.'
            });
        }

        if (!isReviewEligible(order)) {
            const method = String(
                order.paymentMethod || 'COD'
            ).toUpperCase();

            const message = method === 'COD'
                ? 'Đơn COD chỉ được đánh giá sau khi admin xác nhận đã giao và khách đã nhận hàng.'
                : 'Đơn thanh toán trực tuyến chỉ được đánh giá sau khi hệ thống xác nhận đã thanh toán thành công.';

            return res.status(403).json({
                success: false,
                message
            });
        }

        const existing = await Review.findOne({
            order: order._id,
            product: product._id
        }).lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message:
                    'Sản phẩm này đã được đánh giá bằng đơn hàng trên.'
            });
        }

        const review = await Review.create({
            order: order._id,
            product: product._id,
            orderCode,
            reviewerName:
                reviewerName ||
                order.customerName ||
                'Khách hàng',
            phoneLast4: phone.slice(-4),
            rating,
            comment,
            verifiedPurchase: true,
            paymentMethod:
                String(order.paymentMethod || 'COD')
                    .toUpperCase(),
            approved: true
        });

        const summary = await getReviewSummary(productId);

        return res.status(201).json({
            success: true,
            message: 'Cảm ơn bạn đã đánh giá sản phẩm.',
            review: serializeReview(review),
            summary
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'Sản phẩm này đã được đánh giá bằng đơn hàng trên.'
            });
        }

        console.error(
            'createReview error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                'Không thể gửi đánh giá.'
        });
    }
};

exports.getReviewSummary = getReviewSummary;
