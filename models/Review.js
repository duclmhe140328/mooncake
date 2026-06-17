const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    orderCode: {
        type: String,
        trim: true,
        uppercase: true,
        required: true,
        index: true
    },
    reviewerName: {
        type: String,
        trim: true,
        required: true,
        maxlength: 120
    },
    phoneLast4: {
        type: String,
        trim: true,
        default: ''
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        index: true
    },
    comment: {
        type: String,
        trim: true,
        required: true,
        minlength: 10,
        maxlength: 1200
    },
    verifiedPurchase: {
        type: Boolean,
        default: true,
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'VNPAY', 'BANK_TRANSFER'],
        required: true
    },
    approved: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true,
    versionKey: false
});

reviewSchema.index(
    {
        order: 1,
        product: 1
    },
    {
        unique: true
    }
);

reviewSchema.index({
    product: 1,
    approved: 1,
    createdAt: -1
});

module.exports =
    mongoose.models.Review ||
    mongoose.model('Review', reviewSchema);
