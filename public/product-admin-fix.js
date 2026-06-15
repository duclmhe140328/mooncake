(function () {
    'use strict';

    const $id = (id) => document.getElementById(id);

    function message(text, type = '') {
        if (typeof window.setProductMessage === 'function') {
            window.setProductMessage(text, type);
            return;
        }
        const target = $id('product-form-message') || $id('form-message') || $id('list-message');
        if (target) {
            target.textContent = text;
            target.className = `${target.className || ''} ${type}`.trim();
        }
    }

    async function readResponse(response) {
        const raw = await response.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch (_) {
            const looksLikeHtml = /<!doctype|<html/i.test(raw);
            throw new Error(looksLikeHtml
                ? `API bị chuyển sang trang HTML (${response.status}). Hãy đặt app.use('/api/products', productRoutes) trước route trả index.html.`
                : `API trả dữ liệu không hợp lệ (${response.status}).`);
        }
        if (!response.ok || data?.success === false) {
            const error = new Error(data?.error || `Lỗi HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            ...options,
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });
        return readResponse(response);
    }

    function getValue(id, fallback = '') {
        const element = $id(id);
        return element ? element.value : fallback;
    }

    function getChecked(id, fallback = false) {
        const element = $id(id);
        return element ? element.checked : fallback;
    }

    function number(value) {
        const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function collectImages() {
        const ids = ['product-image-main', 'product-image-2', 'product-image-3', 'product-image-4'];
        const values = ids.map(id => getValue(id).trim()).filter(Boolean);

        // Hỗ trợ cả trang admin-products.html cũ
        if (!values.length && Array.isArray(window.imageValues)) {
            return window.imageValues.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4);
        }
        return [...new Set(values)].slice(0, 4);
    }

    function collectOptions() {
        if (typeof window.parseProductOptions === 'function') {
            return window.parseProductOptions(getValue('product-options'));
        }
        if (typeof window.getOptions === 'function') return window.getOptions();
        return [];
    }

    function collectPayload() {
        // Form admin.html tích hợp
        if ($id('product-name')) {
            const images = collectImages();
            if (!images.length) throw new Error('Cần ít nhất 1 ảnh sản phẩm. Có thể bổ sung tối đa 3 ảnh chi tiết.');

            const isSpecial = getChecked('product-special');
            const isRetail = getChecked('product-retail');
            if (!isSpecial && !isRetail) throw new Error('Bạn phải tick ít nhất “Đặc biệt / hộp quà” hoặc “Sản phẩm bán lẻ”.');

            return {
                name: getValue('product-name').trim(),
                code: getValue('product-code').trim().toUpperCase(),
                tag: getValue('product-tag', 'madame-huong'),
                price: number(getValue('product-price')),
                description: getValue('product-description').trim(),
                images,
                tags: getValue('product-tags').split(',').map(item => item.trim()).filter(Boolean),
                options: collectOptions(),
                optionLabel: getValue('product-option-label', 'Chọn quy cách') || 'Chọn quy cách',
                isSpecial,
                isRetail,
                active: getChecked('product-active', true),
                sortOrder: number(getValue('product-sort-order'))
            };
        }

        // Form admin-products.html độc lập
        if (typeof window.collectPayload === 'function') return window.collectPayload();
        throw new Error('Không tìm thấy biểu mẫu sản phẩm.');
    }

    function normalizeDisplayArea(payload = {}) {
        const normalized = { ...payload };
        const type = String(normalized.productType || normalized.type || '').trim().toLowerCase();

        // productType là nguồn xác định khu vực hiển thị trên frontend.
        // collection -> Hộp Quà Thượng Hạng / Bộ Sưu Tập Maison theo thương hiệu.
        // retail -> Sản Phẩm Bán Lẻ.
        if (type === 'collection') {
            normalized.isSpecial = true;
            normalized.isRetail = false;
        } else if (type === 'retail') {
            normalized.isSpecial = false;
            normalized.isRetail = true;
        } else {
            normalized.isSpecial = Boolean(normalized.isSpecial);
            normalized.isRetail = Boolean(normalized.isRetail);
        }

        return normalized;
    }

    async function updateWithFallback(id, payload) {
        try {
            return await request(`/api/products/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        } catch (error) {
            if (![404, 405, 501].includes(error.status) && !/trang HTML|không hợp lệ/i.test(error.message)) throw error;
            return request(`/api/products/${encodeURIComponent(id)}/update`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }
    }

    async function deleteWithFallback(id) {
        try {
            return await request(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch (error) {
            if (![404, 405, 501].includes(error.status) && !/trang HTML|không hợp lệ/i.test(error.message)) throw error;
            return request(`/api/products/${encodeURIComponent(id)}/delete`, { method: 'POST' });
        }
    }

    async function fixedSubmit(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const submitButton = $id('product-submit-btn') || $id('save-button');
        const editId = getValue('product-edit-id') || getValue('product-id');

        try {
            const payload = normalizeDisplayArea(collectPayload());
            if (!payload.name) throw new Error('Vui lòng nhập tên sản phẩm.');
            if (!payload.code) throw new Error('Vui lòng nhập mã sản phẩm.');
            if (payload.price <= 0 && (!payload.options || !payload.options.length)) {
                throw new Error('Cần nhập giá cơ bản hoặc ít nhất một biến thể có giá.');
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = editId ? 'Đang cập nhật...' : 'Đang lưu...';
            }
            message('Đang gửi dữ liệu lên máy chủ...');

            if (editId) {
                await updateWithFallback(editId, payload);
                message('Đã cập nhật sản phẩm.', 'success');
            } else {
                await request('/api/products', { method: 'POST', body: JSON.stringify(payload) });
                message('Đã thêm sản phẩm mới.', 'success');
            }

            if (typeof window.resetProductForm === 'function') window.resetProductForm(false);
            else if (typeof window.resetForm === 'function') window.resetForm(false);

            if (typeof window.loadProductsAdmin === 'function') await window.loadProductsAdmin();
            else if (typeof window.loadProducts === 'function') await window.loadProducts(false);
        } catch (error) {
            console.error('product submit error:', error);
            message(error.message || 'Không thể lưu sản phẩm.', 'error');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                const stillEditing = Boolean(getValue('product-edit-id') || getValue('product-id'));
                submitButton.textContent = stillEditing ? 'Cập nhật sản phẩm' : 'Lưu sản phẩm';
            }
        }
    }

    window.deleteProductById = async function fixedDeleteProductById(productId) {
        const cache = Array.isArray(window.productsCache) ? window.productsCache : [];
        const product = cache.find(item => String(item._id) === String(productId));
        const name = product?.name || product?.code || 'sản phẩm này';
        if (!window.confirm(`Xóa sản phẩm “${name}”? Sản phẩm sẽ biến mất khỏi frontend.`)) return;

        try {
            message('Đang xóa sản phẩm...');
            await deleteWithFallback(productId);
            message('Đã xóa sản phẩm.', 'success');
            if (typeof window.loadProductsAdmin === 'function') await window.loadProductsAdmin();
        } catch (error) {
            console.error('product delete error:', error);
            message(error.message || 'Không thể xóa sản phẩm.', 'error');
        }
    };

    // Hỗ trợ trang admin-products.html cũ
    window.deleteProduct = async function fixedDeleteProduct(id, name) {
        if (!window.confirm(`Xóa sản phẩm “${name || 'này'}”? Sản phẩm sẽ biến mất khỏi frontend.`)) return;
        try {
            await deleteWithFallback(id);
            message('Đã xóa sản phẩm.', 'success');
            if (typeof window.loadProducts === 'function') await window.loadProducts(false);
        } catch (error) {
            console.error('product delete error:', error);
            message(error.message || 'Không thể xóa sản phẩm.', 'error');
        }
    };

    function install() {
        const form = $id('product-form');
        if (form) form.addEventListener('submit', fixedSubmit, true);
        console.info('Product CRUD + variant image fix v5 loaded.');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
