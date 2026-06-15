const mongoose = require('mongoose');
const Product = require('../models/Product');

function text(value, max = 3000) {
    return String(value ?? '').trim().slice(0, max);
}

function bool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function normalizeTag(value) {
    const raw = text(value, 80).toLowerCase();
    return raw.includes('maison') ? 'maison' : 'madame-huong';
}

function normalizeImages(value) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map(item => text(item, 5_000_000)).filter(Boolean))].slice(0, 4);
}

function normalizeTags(value) {
    const source = Array.isArray(value) ? value : text(value).split(',');
    return [...new Set(source.map(item => text(item, 60)).filter(Boolean))].slice(0, 12);
}

function normalizeOptions(value, baseCode = 'SP') {
    if (!Array.isArray(value)) return [];

    return value.map((item, index) => {
        const rawImageIndex = item?.imageIndex ?? item?.image_index ?? item?.imageSlot;
        const parsedImageIndex = rawImageIndex === '' || rawImageIndex === null || rawImageIndex === undefined
            ? null
            : Number(rawImageIndex);
        const imageIndex = Number.isInteger(parsedImageIndex) && parsedImageIndex >= 0 && parsedImageIndex <= 3
            ? parsedImageIndex
            : null;

        return {
            size: text(item?.size || item?.label || `Lựa chọn ${index + 1}`, 100),
            // Không bắt quản trị viên phải tự nhập mã cho từng loại.
            // Nếu để trống, backend tự sinh từ mã sản phẩm để loại không bị biến mất.
            code: text(item?.code || `${baseCode}-${index + 1}`, 80).toUpperCase(),
            price: Number(item?.price || 0),
            hsd: text(item?.hsd || item?.expiry || '', 100),
            image: text(item?.image || item?.imageUrl || '', 5_000_000),
            imageIndex
        };
    }).filter(item => item.size && Number.isFinite(item.price) && item.price >= 0).slice(0, 30);
}

function buildPayload(body = {}, current = null) {
    const incomingTag = body.tag ?? body.brand ?? current?.tag;
    const incomingType = text(body.productType || body.type).toLowerCase();

    let isRetail;
    let isSpecial;

    // Khi frontend gửi productType, dùng chính trường này để xác định khu vực.
    // Tránh trường hợp chọn “Hộp / Bộ sưu tập” nhưng checkbox isSpecial=false
    // làm cả isSpecial và isRetail đều false.
    if (incomingType === 'collection') {
        isSpecial = true;
        isRetail = false;
    } else if (incomingType === 'retail') {
        isSpecial = false;
        isRetail = true;
    } else {
        isRetail = body.isRetail !== undefined
            ? bool(body.isRetail)
            : Boolean(current?.isRetail);

        isSpecial = body.isSpecial !== undefined
            ? bool(body.isSpecial)
            : Boolean(current?.isSpecial);
    }

    const incomingImages = normalizeImages(body.images);
    const images = incomingImages.length ? incomingImages : normalizeImages(current?.images);
    const normalizedCode = text(body.code ?? current?.code, 80).toUpperCase();

    const payload = {
        name: text(body.name ?? current?.name, 180),
        code: normalizedCode,
        tag: normalizeTag(incomingTag),
        description: text(body.description ?? body.desc ?? current?.description, 3000),
        price: Number(body.price ?? current?.price ?? 0),
        images,
        tags: body.tags !== undefined ? normalizeTags(body.tags) : normalizeTags(current?.tags),
        options: body.options !== undefined
            ? normalizeOptions(body.options, normalizedCode)
            : normalizeOptions(current?.options, normalizedCode),
        optionLabel: text(body.optionLabel ?? current?.optionLabel ?? 'Chọn quy cách', 100) || 'Chọn quy cách',
        isSpecial,
        isRetail,
        active: body.active === undefined ? (current?.active !== false) : bool(body.active, true),
        sortOrder: Number(body.sortOrder ?? current?.sortOrder ?? 0)
    };

    if (!payload.name) throw new Error('Tên sản phẩm không được để trống.');
    if (!payload.code) throw new Error('Mã sản phẩm không được để trống.');
    if (!Number.isFinite(payload.price) || payload.price < 0) throw new Error('Giá sản phẩm không hợp lệ.');
    if (!payload.images.length) throw new Error('Cần ít nhất 1 ảnh sản phẩm.');
    if (!payload.isSpecial && !payload.isRetail) throw new Error('Phải chọn ít nhất một khu vực hiển thị.');
    if (payload.price <= 0 && payload.options.length === 0) throw new Error('Cần nhập giá cơ bản hoặc ít nhất một biến thể có giá.');
    if (!Number.isFinite(payload.sortOrder)) payload.sortOrder = 0;

    return payload;
}

function serialize(product) {
    const value = product?.toObject ? product.toObject() : { ...product };
    value.brand = value.tag === 'maison' ? 'Maison' : 'Madame Hương';
    value.productType = value.isRetail && !value.isSpecial ? 'retail' : 'collection';
    return value;
}

function checkId(id) {
    if (!mongoose.isValidObjectId(id)) {
        const error = new Error('ID sản phẩm không hợp lệ.');
        error.status = 400;
        throw error;
    }
}

exports.getProducts = async (req, res) => {
    try {
        const filter = {};
        const includeInactive = req.query.includeInactive === 'true';
        if (!includeInactive || req.query.active === 'true') filter.active = true;
        if (req.query.active === 'false') filter.active = false;
        if (req.query.tag || req.query.brand) filter.tag = normalizeTag(req.query.tag || req.query.brand);
        if (req.query.special === 'true') filter.isSpecial = true;
        if (req.query.retail === 'true' || req.query.productType === 'retail') filter.isRetail = true;

        const sortMode = text(req.query.sort, 30).toLowerCase();
        const sort =
            sortMode === 'popular'
                ? { soldCount: -1, sortOrder: 1, createdAt: -1 }
                : sortMode === 'price-asc'
                    ? { price: 1, sortOrder: 1, createdAt: -1 }
                    : sortMode === 'price-desc'
                        ? { price: -1, sortOrder: 1, createdAt: -1 }
                        : { sortOrder: 1, createdAt: -1 };

        const products = await Product.find(filter).sort(sort).lean();
        return res.json({ success: true, products: products.map(serialize) });
    } catch (error) {
        console.error('getProducts error:', error);
        return res.status(500).json({ success: false, error: 'Không thể tải danh sách sản phẩm.' });
    }
};

exports.createProduct = async (req, res) => {
    try {
        const payload = buildPayload(req.body);
        const product = await Product.create(payload);
        return res.status(201).json({ success: true, product: serialize(product), message: 'Đã thêm sản phẩm.' });
    } catch (error) {
        console.error('createProduct error:', error);
        if (error?.code === 11000) return res.status(409).json({ success: false, error: 'Mã sản phẩm đã tồn tại.' });
        return res.status(error.status || 400).json({ success: false, error: error.message || 'Không thể thêm sản phẩm.' });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        checkId(req.params.id);
        const current = await Product.findById(req.params.id);
        if (!current) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm.' });

        const payload = buildPayload(req.body, current);
        Object.assign(current, payload);
        await current.save();

        return res.json({ success: true, product: serialize(current), message: 'Đã cập nhật sản phẩm.' });
    } catch (error) {
        console.error('updateProduct error:', error);
        if (error?.code === 11000) return res.status(409).json({ success: false, error: 'Mã sản phẩm đã tồn tại.' });
        return res.status(error.status || 400).json({ success: false, error: error.message || 'Không thể cập nhật sản phẩm.' });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        checkId(req.params.id);
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm.' });
        return res.json({ success: true, message: 'Đã xóa sản phẩm.', deletedId: String(product._id) });
    } catch (error) {
        console.error('deleteProduct error:', error);
        return res.status(error.status || 400).json({ success: false, error: error.message || 'Không thể xóa sản phẩm.' });
    }
};
