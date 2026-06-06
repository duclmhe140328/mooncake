const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        orderCode: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        customerName: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        address: {
            type: String,
            required: true,
            trim: true
        },

        products: [
            {
                productId: {
                    type: String,
                    required: true
                },
                name: {
                    type: String,
                    required: true
                },
                weight: {
                    type: String,
                    default: ''
                },
                hsd: {
                    type: String,
                    default: ''
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1
                },
                price: {
                    type: Number,
                    required: true,
                    min: 0
                }
            }
        ],

        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },

        paymentMethod: {
            type: String,
            enum: ['COD', 'VNPAY'],
            default: 'COD'
        },

        paymentStatus: {
            type: String,
            enum: ['PENDING', 'PAID', 'FAILED'],
            default: 'PENDING'
        },

        orderStatus: {
            type: String,
            default: 'NEW'
        },

        vnpayTxnRef: {
            type: String,
            default: ''
        },

        vnpayTransactionNo: {
            type: String,
            default: ''
        },

        vnpayBankCode: {
            type: String,
            default: ''
        },

        vnpayPayDate: {
            type: String,
            default: ''
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('Order', orderSchema);