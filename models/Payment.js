const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true
        },
        orderCode: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
            uppercase: true
        },
        customerName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        phone: {
            type: String,
            required: true,
            trim: true,
            maxlength: 20
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 240
        },
        amount: {
            type: Number,
            required: true,
            min: 1000,
            max: 500000000
        },
        currency: {
            type: String,
            default: 'VND'
        },
        gateway: {
            type: String,
            default: 'BANK_TRANSFER_SEPAY'
        },
        status: {
            type: String,
            enum: ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'],
            default: 'PENDING',
            index: true
        },
        bankName: {
            type: String,
            default: ''
        },
        bankAccountNumber: {
            type: String,
            default: ''
        },
        bankAccountName: {
            type: String,
            default: ''
        },
        transferContent: {
            type: String,
            required: true,
            index: true
        },
        gatewayTransactionId: {
            type: String,
            default: '',
            index: true
        },
        gatewayReferenceCode: {
            type: String,
            default: ''
        },
        gatewayBankCode: {
            type: String,
            default: ''
        },
        paidAt: {
            type: Date,
            default: null
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true
        },
        notifiedAt: {
            type: Date,
            default: null
        },
        clientIp: {
            type: String,
            default: ''
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

paymentSchema.index({
    status: 1,
    expiresAt: 1
});

module.exports =
    mongoose.models.Payment ||
    mongoose.model('Payment', paymentSchema);
