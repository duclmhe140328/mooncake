const mongoose = require('mongoose');

const orderProductSchema = new mongoose.Schema({
    productId: {
        type: String,
        trim: true,
        default: ''
    },
    catalogProductId: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    baseCode: {
        type: String,
        trim: true,
        uppercase: true,
        default: ''
    },
    brand: {
        type: String,
        trim: true,
        default: ''
    },
    name: {
        type: String,
        trim: true,
        required: true
    },
    weight: {
        type: String,
        trim: true,
        default: ''
    },
    hsd: {
        type: String,
        trim: true,
        default: ''
    },
    quantity: {
        type: Number,
        min: 1,
        default: 1
    },
    price: {
        type: Number,
        min: 0,
        default: 0
    }
}, {
    _id: false,
    strict: false
});

const orderSchema = new mongoose.Schema({
    orderCode: {
        type: String,
        trim: true,
        uppercase: true,
        required: true,
        unique: true,
        index: true
    },
    customerName: {
        type: String,
        trim: true,
        required: true
    },
    phone: {
        type: String,
        trim: true,
        required: true,
        index: true
    },
    address: {
        type: String,
        trim: true,
        required: true
    },
    products: {
        type: [orderProductSchema],
        default: []
    },
    totalAmount: {
        type: Number,
        min: 0,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'VNPAY'],
        default: 'COD',
        index: true
    },
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
        default: 'PENDING',
        index: true
    },
    orderStatus: {
        type: String,
        enum: [
            'NEW',
            'CONFIRMED',
            'PACKING',
            'SHIPPING',
            'DELIVERED',
            'CANCELLED'
        ],
        default: 'NEW',
        index: true
    },
    salesCounted: {
        type: Boolean,
        default: false,
        index: true
    },
    vnpayTxnRef: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    vnpayTransactionNo: {
        type: String,
        trim: true,
        default: ''
    },
    vnpayBankCode: {
        type: String,
        trim: true,
        default: ''
    },
    vnpayPayDate: {
        type: String,
        trim: true,
        default: ''
    },
    vnpayResponseCode: {
        type: String,
        trim: true,
        default: ''
    },
    vnpayTransactionStatus: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true,
    versionKey: false,
    strict: false
});

orderSchema.index({
    createdAt: -1
});

orderSchema.index({
    paymentMethod: 1,
    paymentStatus: 1,
    orderStatus: 1,
    createdAt: -1
});

module.exports =
    mongoose.models.Order ||
    mongoose.model('Order', orderSchema);
