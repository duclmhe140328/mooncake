const mongoose = require('mongoose');

const productOptionSchema = new mongoose.Schema({
    size: { type: String, trim: true, required: true },
    code: { type: String, trim: true, uppercase: true, required: true },
    price: { type: Number, min: 0, required: true },
    hsd: { type: String, trim: true, default: '' },
    // Ảnh riêng của biến thể. imageIndex trỏ tới vị trí trong mảng product.images (0-3).
    image: { type: String, trim: true, default: '' },
    imageIndex: { type: Number, min: 0, max: 3, default: null }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true, maxlength: 180 },
    code: { type: String, trim: true, uppercase: true, required: true, unique: true, index: true, maxlength: 80 },
    tag: {
        type: String,
        enum: ['madame-huong', 'maison'],
        default: 'madame-huong',
        index: true
    },
    description: { type: String, trim: true, default: '', maxlength: 3000 },
    price: { type: Number, min: 0, default: 0 },
    images: {
        type: [{ type: String, trim: true }],
        validate: {
            validator(value) {
                return Array.isArray(value) && value.length >= 1 && value.length <= 4;
            },
            message: 'Sản phẩm cần từ 1 đến 4 ảnh.'
        },
        required: true
    },
    tags: { type: [{ type: String, trim: true }], default: [] },
    options: { type: [productOptionSchema], default: [] },
    optionLabel: { type: String, trim: true, default: 'Chọn quy cách' },
    isSpecial: { type: Boolean, default: false, index: true },
    isRetail: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },
    // Tổng số lượng đã bán. Chỉ cập nhật từ luồng tạo đơn/thanh toán thành công.
    soldCount: { type: Number, min: 0, default: 0, index: true },
    sortOrder: { type: Number, default: 0 }
}, {
    timestamps: true,
    versionKey: false
});

// Mongoose 9 không còn truyền tham số `next` cho pre middleware.
// Dùng hook đồng bộ và throw Error để tương thích cả Mongoose 8 và 9.
productSchema.pre('validate', function validateDisplayArea() {
    if (!this.isSpecial && !this.isRetail) {
        throw new Error('Sản phẩm phải thuộc ít nhất một khu vực hiển thị.');
    }
});

productSchema.index({ active: 1, tag: 1, isSpecial: 1, isRetail: 1, soldCount: -1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
