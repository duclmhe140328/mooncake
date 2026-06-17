(function () {
    'use strict';


    // Khi đang ở trang chi tiết hoặc trang thương hiệu, đánh dấu đã qua intro.
    // Vì vậy bấm "Trang chủ" sẽ không mở lại hộp quà.
    try {
        sessionStorage.setItem(
            'trung_thu_pho_intro_seen',
            '1'
        );
    } catch (error) {
        console.warn(
            'Không thể lưu trạng thái intro:',
            error
        );
    }

    const CART_KEY = 'madame_huong_cart';
    const pageData = window.SEO_STORE_DATA || {};
    const products = Array.isArray(pageData.products)
        ? pageData.products
        : [];
    const productMap = new Map(
        products.map(product => [
            String(product.id),
            product
        ])
    );

    let cart = loadCart();
    let detailQuantity = 1;
    let detailOptionIndex = 0;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatCurrency(value) {
        return (
            Number(value || 0)
                .toLocaleString('vi-VN') +
            ' đ'
        );
    }

    function loadCart() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const parsed = raw ? JSON.parse(raw) : [];

            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.map(item => ({
                ...item,
                brand: item.brand || 'Madame Hương',
                quantity: Math.max(
                    1,
                    Number(item.quantity || 1)
                )
            }));
        } catch (error) {
            console.error('Không đọc được giỏ hàng:', error);
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(
            CART_KEY,
            JSON.stringify(cart)
        );

        updateCartCount();
        renderCart();
        renderCheckoutSummary();
    }

    function getCartCount() {
        return cart.reduce((total, item) => {
            return total + Number(item.quantity || 1);
        }, 0);
    }

    function getCartTotal() {
        return cart.reduce((total, item) => {
            return (
                total +
                Number(item.price || 0) *
                Number(item.quantity || 1)
            );
        }, 0);
    }

    function updateCartCount() {
        document
            .querySelectorAll('[data-cart-count]')
            .forEach(element => {
                element.textContent = getCartCount();
            });
    }

    function showToast(message) {
        const toast = document.getElementById('seo-toast');

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('show');

        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => {
            toast.classList.remove('show');
        }, 1900);
    }

    function setModal(id, open) {
        const modal = document.getElementById(id);

        if (!modal) return;

        modal.classList.toggle('active', Boolean(open));
        modal.setAttribute(
            'aria-hidden',
            open ? 'false' : 'true'
        );

        document.body.classList.toggle(
            'seo-modal-open',
            document.querySelector('.seo-modal.active') !== null
        );
    }

    function closeAllModals() {
        document
            .querySelectorAll('.seo-modal.active')
            .forEach(modal => {
                setModal(modal.id, false);
            });
    }

    function createCartItem(
        product,
        option = null,
        quantity = 1
    ) {
        const selected =
            option ||
            product.options?.[0] ||
            null;
        const price =
            Number(selected?.price || 0) ||
            Number(product.price || 0) ||
            Number(product.prices?.min || 0);
        const weight = String(selected?.size || '');
        const itemName = weight
            ? `${product.name} ${weight}`
            : product.name;

        return {
            productId:
                selected?.code ||
                product.code ||
                product.id,
            baseId:
                product.baseId ||
                product.code ||
                product.id,
            catalogProductId:
                product.catalogProductId ||
                product.id,
            brand:
                product.brand ||
                'Madame Hương',
            name: itemName,
            baseName: product.name,
            weight,
            hsd: selected?.hsd || '',
            tags: Array.isArray(product.tags)
                ? product.tags
                : [],
            price,
            quantity: Math.max(1, Number(quantity || 1)),
            img:
                selected?.image ||
                product.images?.[0] ||
                '/logo.png'
        };
    }

    function addCartItem(item, openAfter = false) {
        const existing = cart.find(cartItem => {
            return (
                String(cartItem.productId) ===
                    String(item.productId) &&
                String(cartItem.brand || '') ===
                    String(item.brand || '')
            );
        });

        if (existing) {
            existing.quantity += item.quantity;
        } else {
            cart.push(item);
        }

        saveCart();
        showToast(`Đã thêm ${item.name} vào giỏ hàng`);

        if (openAfter) {
            openCart();
        }
    }

    function renderCart() {
        const list = document.getElementById('seo-cart-list');
        const total = document.getElementById('seo-cart-total');

        if (!list || !total) return;

        if (!cart.length) {
            list.innerHTML = `
                <div class="seo-cart-empty">
                    Giỏ hàng đang trống. Hãy chọn sản phẩm
                    trước khi thanh toán.
                </div>
            `;
            total.textContent = formatCurrency(0);
            return;
        }

        list.innerHTML = cart.map((item, index) => `
            <article class="seo-cart-item">
                <img
                    src="${escapeHtml(item.img || '/logo.png')}"
                    alt="${escapeHtml(item.name)}"
                >

                <div>
                    <span class="seo-cart-brand">
                        ${escapeHtml(item.brand || 'Madame Hương')}
                    </span>
                    <div class="seo-cart-name">
                        ${escapeHtml(item.name)}
                    </div>
                    <div class="seo-cart-meta">
                        Mã: ${escapeHtml(item.productId)}
                        ${item.hsd
                            ? ` • HSD: ${escapeHtml(item.hsd)}`
                            : ''}
                    </div>
                    <div class="seo-cart-price">
                        ${formatCurrency(item.price)} / sản phẩm
                    </div>
                </div>

                <div class="seo-cart-controls">
                    <div class="seo-cart-qty">
                        <button
                            type="button"
                            data-cart-delta="-1"
                            data-cart-index="${index}"
                        >−</button>
                        <span>${Number(item.quantity || 1)}</span>
                        <button
                            type="button"
                            data-cart-delta="1"
                            data-cart-index="${index}"
                        >+</button>
                    </div>

                    <strong>
                        ${formatCurrency(
                            Number(item.price || 0) *
                            Number(item.quantity || 1)
                        )}
                    </strong>

                    <button
                        class="seo-remove-item"
                        type="button"
                        data-remove-cart="${index}"
                    >Xóa</button>
                </div>
            </article>
        `).join('');

        total.textContent = formatCurrency(getCartTotal());
    }

    function renderCheckoutSummary() {
        const summary = document.getElementById(
            'seo-checkout-summary'
        );

        if (!summary) return;

        if (!cart.length) {
            summary.innerHTML = `
                <p style="margin:0;color:var(--text-muted);font-size:12px;">
                    Giỏ hàng đang trống.
                </p>
            `;
            return;
        }

        summary.innerHTML = cart.map(item => `
            <div class="seo-checkout-line">
                <div>
                    <strong>${escapeHtml(item.name)}</strong><br>
                    <small>
                        ${escapeHtml(item.brand || '')}
                        • Mã: ${escapeHtml(item.productId)}
                    </small>
                </div>
                <div style="text-align:right;white-space:nowrap;">
                    x${Number(item.quantity || 1)}<br>
                    <small>
                        ${formatCurrency(
                            Number(item.price || 0) *
                            Number(item.quantity || 1)
                        )}
                    </small>
                </div>
            </div>
        `).join('') + `
            <div class="seo-checkout-line">
                <strong>Tổng thanh toán</strong>
                <strong>${formatCurrency(getCartTotal())}</strong>
            </div>
        `;
    }

    function openCart() {
        renderCart();
        setModal('seo-cart-modal', true);
    }

    function openCheckout() {
        if (!cart.length) {
            showToast('Giỏ hàng đang trống');
            return;
        }

        renderCheckoutSummary();
        setModal('seo-cart-modal', false);
        setModal('seo-checkout-modal', true);
    }

    function createOrderCode() {
        const now = new Date();
        const date = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('');
        const random = Math.random()
            .toString(16)
            .slice(2, 8)
            .toUpperCase();

        return `MH${date}${random}`;
    }

    async function submitOrder(event) {
        event.preventDefault();

        if (!cart.length) {
            showToast('Giỏ hàng đang trống');
            return;
        }

        const button = document.getElementById(
            'seo-checkout-submit'
        );
        const orderCode = createOrderCode();
        const paymentMethod = document.getElementById(
            'seo-c-payment'
        ).value;
        const orderData = {
            orderCode,
            customerName: document.getElementById(
                'seo-c-name'
            ).value.trim(),
            phone: document.getElementById(
                'seo-c-phone'
            ).value.trim(),
            address: document.getElementById(
                'seo-c-address'
            ).value.trim(),
            paymentMethod,
            products: cart.map(item => ({
                productId: item.productId,
                catalogProductId:
                    item.catalogProductId || '',
                baseCode: item.baseId || '',
                brand:
                    item.brand ||
                    'Madame Hương',
                name:
                    `${item.brand || 'Madame Hương'} - ` +
                    `${item.name}`,
                weight: item.weight || '',
                hsd: item.hsd || '',
                quantity: Number(item.quantity || 1),
                price: Number(item.price || 0)
            })),
            totalAmount: getCartTotal()
        };

        button.disabled = true;
        button.textContent = 'Đang xử lý...';

        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.error ||
                    data.message ||
                    'Không thể tạo đơn hàng.'
                );
            }

            if (
                ['VNPAY', 'BANK_TRANSFER'].includes(
                    paymentMethod
                ) &&
                data.paymentUrl
            ) {
                window.location.href = data.paymentUrl;
                return;
            }

            cart = [];
            saveCart();
            document.getElementById(
                'seo-checkout-form'
            ).reset();
            setModal('seo-checkout-modal', false);

            const readableCode = String(
                data.orderCode ||
                data.order?.orderCode ||
                data.order?._id ||
                data._id ||
                orderCode
            ).toUpperCase();

            document.getElementById(
                'seo-success-order-code'
            ).textContent = readableCode;
            setModal('seo-success-modal', true);
        } catch (error) {
            console.error('Lỗi đặt hàng:', error);
            alert(error.message || 'Không thể kết nối máy chủ.');
        } finally {
            button.disabled = false;
            button.textContent = 'Xác nhận đặt hàng';
        }
    }

    function updateDetailVariant() {
        const product = productMap.get(
            String(pageData.currentProductId || '')
        );

        if (!product) return;

        const option = product.options?.[detailOptionIndex] || null;
        const price =
            Number(option?.price || 0) ||
            Number(product.price || 0) ||
            Number(product.prices?.min || 0);

        const priceElement = document.getElementById(
            'seo-detail-price'
        );
        const codeElement = document.getElementById(
            'seo-detail-code'
        );
        const optionElement = document.getElementById(
            'seo-detail-option'
        );
        const hsdElement = document.getElementById(
            'seo-detail-hsd'
        );
        const mainImage = document.getElementById(
            'seo-main-product-image'
        );

        if (priceElement) {
            priceElement.textContent = formatCurrency(price);
        }
        if (codeElement) {
            codeElement.textContent =
                option?.code ||
                product.code ||
                product.id;
        }
        if (optionElement) {
            optionElement.textContent =
                option?.size ||
                'Tiêu chuẩn';
        }
        if (hsdElement) {
            hsdElement.textContent =
                option?.hsd ||
                'Theo thông tin nhà sản xuất';
        }
        if (mainImage && option?.image) {
            mainImage.src = option.image;
        }

        document
            .querySelectorAll('[data-detail-variant]')
            .forEach(button => {
                button.classList.toggle(
                    'active',
                    Number(button.dataset.detailVariant) ===
                        detailOptionIndex
                );
            });
    }

    function addDetailProduct(openCheckoutAfter = false) {
        const product = productMap.get(
            String(pageData.currentProductId || '')
        );

        if (!product) return;

        const option = product.options?.[detailOptionIndex] || null;
        const item = createCartItem(
            product,
            option,
            detailQuantity
        );

        addCartItem(item, false);

        if (openCheckoutAfter) {
            openCheckout();
        }
    }

    function setupGallery() {
        const mainImage = document.getElementById(
            'seo-main-product-image'
        );

        if (!mainImage) return;

        document
            .querySelectorAll('[data-gallery-image]')
            .forEach(button => {
                button.addEventListener('click', () => {
                    document
                        .querySelectorAll('[data-gallery-image]')
                        .forEach(item => {
                            item.classList.remove('active');
                        });

                    button.classList.add('active');
                    mainImage.src = button.dataset.galleryImage;
                });
            });
    }

    function setupCategoryControls() {
        const grid = document.getElementById(
            'seo-category-grid'
        );
        const sort = document.getElementById(
            'seo-category-sort'
        );

        if (!grid || !sort) return;

        let currentFilter = 'all';

        function apply() {
            const cards = Array.from(
                grid.querySelectorAll('[data-catalog-card]')
            );

            cards.forEach(card => {
                const retail = card.dataset.retail === 'true';
                const visible =
                    currentFilter === 'all' ||
                    (currentFilter === 'retail' && retail) ||
                    (currentFilter === 'gift' && !retail);

                card.hidden = !visible;
            });

            const visibleCards = cards.filter(card => !card.hidden);

            visibleCards.sort((a, b) => {
                const aPrice = Number(a.dataset.price || 0);
                const bPrice = Number(b.dataset.price || 0);
                const aSold = Number(a.dataset.sold || 0);
                const bSold = Number(b.dataset.sold || 0);
                const mode = sort.value;

                if (mode === 'price-asc') {
                    return aPrice - bPrice || bSold - aSold;
                }
                if (mode === 'price-desc') {
                    return bPrice - aPrice || bSold - aSold;
                }
                if (mode === 'name') {
                    return String(a.dataset.name || '')
                        .localeCompare(
                            String(b.dataset.name || ''),
                            'vi'
                        );
                }

                return bSold - aSold || aPrice - bPrice;
            });

            visibleCards.forEach(card => {
                grid.appendChild(card);
            });

            const empty = document.getElementById(
                'seo-empty-category'
            );

            if (empty) {
                empty.hidden = visibleCards.length > 0;
            }
        }

        document
            .querySelectorAll('[data-category-filter]')
            .forEach(button => {
                button.addEventListener('click', () => {
                    currentFilter = button.dataset.categoryFilter;
                    document
                        .querySelectorAll('[data-category-filter]')
                        .forEach(item => {
                            item.classList.toggle(
                                'active',
                                item === button
                            );
                        });
                    apply();
                });
            });

        sort.addEventListener('change', apply);
        apply();
    }

    document.addEventListener('click', event => {
        const openCartButton = event.target.closest(
            '[data-open-cart]'
        );
        if (openCartButton) {
            openCart();
            return;
        }

        const closeButton = event.target.closest(
            '[data-close-modal]'
        );
        if (closeButton) {
            closeAllModals();
            return;
        }

        const modalBackdrop = event.target.closest('.seo-modal');
        if (
            modalBackdrop &&
            event.target === modalBackdrop
        ) {
            setModal(modalBackdrop.id, false);
            return;
        }

        const cartDeltaButton = event.target.closest(
            '[data-cart-delta]'
        );
        if (cartDeltaButton) {
            const index = Number(
                cartDeltaButton.dataset.cartIndex
            );
            const delta = Number(
                cartDeltaButton.dataset.cartDelta
            );

            if (cart[index]) {
                cart[index].quantity = Math.max(
                    1,
                    Number(cart[index].quantity || 1) + delta
                );
                saveCart();
            }
            return;
        }

        const removeButton = event.target.closest(
            '[data-remove-cart]'
        );
        if (removeButton) {
            const index = Number(
                removeButton.dataset.removeCart
            );
            cart.splice(index, 1);
            saveCart();
            return;
        }

        const quickAddButton = event.target.closest(
            '[data-quick-add]'
        );
        if (quickAddButton) {
            const product = productMap.get(
                String(quickAddButton.dataset.quickAdd)
            );
            if (product) {
                addCartItem(
                    createCartItem(product, product.options?.[0]),
                    false
                );
            }
            return;
        }

        const variantButton = event.target.closest(
            '[data-detail-variant]'
        );
        if (variantButton) {
            detailOptionIndex = Number(
                variantButton.dataset.detailVariant
            );
            updateDetailVariant();
            return;
        }

        const qtyButton = event.target.closest(
            '[data-detail-qty]'
        );
        if (qtyButton) {
            detailQuantity = Math.max(
                1,
                detailQuantity +
                    Number(qtyButton.dataset.detailQty)
            );
            const quantityElement = document.getElementById(
                'seo-detail-qty'
            );
            if (quantityElement) {
                quantityElement.textContent = detailQuantity;
            }
            return;
        }

        if (event.target.closest('[data-add-detail-cart]')) {
            addDetailProduct(false);
            openCart();
            return;
        }

        if (event.target.closest('[data-buy-detail-now]')) {
            addDetailProduct(true);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeAllModals();
        }
    });

    document
        .getElementById('seo-open-checkout')
        ?.addEventListener('click', openCheckout);

    document
        .getElementById('seo-checkout-form')
        ?.addEventListener('submit', submitOrder);

    document
        .getElementById('seo-copy-order-code')
        ?.addEventListener('click', async () => {
            const code = document.getElementById(
                'seo-success-order-code'
            )?.textContent || '';

            if (!code || code === '---') return;

            try {
                await navigator.clipboard.writeText(code);
                showToast('Đã sao chép mã đơn hàng');
            } catch {
                const input = document.createElement('input');
                input.value = code;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                input.remove();
                showToast('Đã sao chép mã đơn hàng');
            }
        });


    function slugifyProduct(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 100) || 'san-pham';
    }

    function normalizeSearch(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getProductSearchUrl(product) {
        const id = String(product?._id || product?.id || '').trim();
        if (!/^[a-f0-9]{24}$/i.test(id)) return '';
        return `/san-pham/${slugifyProduct(product?.name)}/${id}`;
    }

    function getSearchProductImage(product) {
        const images = Array.isArray(product?.images)
            ? product.images
            : [];

        return String(
            images[0] ||
            product?.image ||
            product?.mainImage ||
            product?.imageUrl ||
            '/logo.png'
        );
    }

    function getSearchProductPrice(product) {
        const optionPrices = Array.isArray(product?.options)
            ? product.options
                .map(option => Number(option?.price || 0))
                .filter(price => price > 0)
            : [];

        if (optionPrices.length) {
            return Math.min(...optionPrices);
        }

        return Number(product?.price || 0);
    }

    function setupGlobalProductSearch() {
        const input = document.getElementById(
            'seo-site-search-input'
        );
        const results = document.getElementById(
            'seo-site-search-results'
        );

        if (!input || !results) return;

        let catalog = [];
        let loaded = false;
        let loadingPromise = null;

        function closeResults() {
            results.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        }

        async function loadCatalog() {
            if (loaded) return catalog;
            if (loadingPromise) return loadingPromise;

            loadingPromise = fetch('/api/products?active=true', {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    catalog = Array.isArray(data)
                        ? data
                        : (
                            Array.isArray(data?.products)
                                ? data.products
                                : []
                        );
                    loaded = true;
                    return catalog;
                })
                .catch(error => {
                    console.error(
                        'Không tải được catalog tìm kiếm:',
                        error
                    );
                    catalog = [];
                    loaded = true;
                    return catalog;
                });

            return loadingPromise;
        }

        async function renderResults() {
            const query = normalizeSearch(input.value);

            if (!query) {
                results.innerHTML = '';
                closeResults();
                return;
            }

            results.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            results.innerHTML = `
                <div class="seo-site-search-empty">
                    Đang tìm sản phẩm...
                </div>
            `;

            const products = await loadCatalog();
            const parts = query.split(' ').filter(Boolean);

            const matches = products
                .filter(product => product?.active !== false)
                .map(product => {
                    const brand = String(
                        product?.brand ||
                        (
                            String(product?.tag || '')
                                .toLowerCase()
                                .includes('maison')
                                ? 'Maison'
                                : 'Madame Hương'
                        )
                    );
                    const text = normalizeSearch([
                        product?.name,
                        brand,
                        product?.description,
                        product?.desc,
                        product?.code,
                        ...(Array.isArray(product?.tags)
                            ? product.tags
                            : [])
                    ].join(' '));
                    const nameText = normalizeSearch(product?.name);
                    const score = parts.reduce((total, part) => {
                        if (nameText.startsWith(part)) return total + 8;
                        if (nameText.includes(part)) return total + 5;
                        if (normalizeSearch(brand).includes(part)) {
                            return total + 3;
                        }
                        return total + (text.includes(part) ? 1 : -20);
                    }, 0);

                    return {
                        product,
                        brand,
                        text,
                        score,
                        url: getProductSearchUrl(product)
                    };
                })
                .filter(item => {
                    return (
                        item.url &&
                        parts.every(part => item.text.includes(part))
                    );
                })
                .sort((left, right) => {
                    return (
                        right.score - left.score ||
                        Number(right.product?.soldCount || 0) -
                            Number(left.product?.soldCount || 0)
                    );
                })
                .slice(0, 8);

            if (!matches.length) {
                results.innerHTML = `
                    <div class="seo-site-search-empty">
                        Không tìm thấy sản phẩm phù hợp.
                    </div>
                `;
                return;
            }

            results.innerHTML = matches.map(item => `
                <a
                    class="seo-site-search-result"
                    href="${escapeHtml(item.url)}"
                    role="option"
                >
                    <img
                        src="${escapeHtml(getSearchProductImage(item.product))}"
                        alt="${escapeHtml(item.product?.name || 'Sản phẩm')}"
                    >
                    <span>
                        <small>${escapeHtml(item.brand)}</small>
                        <strong>${escapeHtml(item.product?.name || 'Sản phẩm')}</strong>
                    </span>
                    <b>${formatCurrency(getSearchProductPrice(item.product))}</b>
                </a>
            `).join('');
        }

        input.addEventListener('focus', () => {
            loadCatalog();
            if (input.value.trim()) renderResults();
        });
        input.addEventListener('input', renderResults);
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeResults();
                input.blur();
            }

            if (event.key === 'Enter') {
                const first = results.querySelector(
                    '.seo-site-search-result'
                );
                if (first) {
                    event.preventDefault();
                    window.location.href = first.href;
                }
            }
        });

        document.addEventListener('click', event => {
            if (!event.target.closest('.seo-site-search')) {
                closeResults();
            }
        });
    }

    function reviewStars(rating) {
        const rounded = Math.round(Number(rating || 0));
        return Array.from({ length: 5 }, (_, index) => {
            return index < rounded ? '★' : '☆';
        }).join('');
    }

    function formatReviewDate(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('vi-VN');
    }

    function paymentMethodLabel(value) {
        const method = String(value || 'COD').toUpperCase();
        if (method === 'BANK_TRANSFER') return 'QR ngân hàng';
        if (method === 'VNPAY') return 'VNPay';
        return 'COD';
    }

    function renderReviewItem(review) {
        const reviewerName = String(review.reviewerName || 'Khách hàng');
        const reviewerInitial = reviewerName.trim().charAt(0).toUpperCase() || 'K';

        return `
            <article class="seo-review-card">
                <div class="seo-review-card-head">
                    <div class="seo-review-author">
                        <span class="seo-review-avatar" aria-hidden="true">
                            ${escapeHtml(reviewerInitial)}
                        </span>
                        <div>
                            <strong>${escapeHtml(reviewerName)}</strong>
                            <span>${escapeHtml(formatReviewDate(review.createdAt))}</span>
                        </div>
                    </div>
                    <div
                        class="seo-review-stars"
                        aria-label="${Number(review.rating || 0)} trên 5 sao"
                    >${reviewStars(review.rating)}</div>
                </div>
                <p>${escapeHtml(review.comment || '').replace(/\n/g, '<br>')}</p>
                ${review.verifiedPurchase ? `
                    <footer class="seo-review-card-footer">
                        <small class="seo-verified-review">
                            <span aria-hidden="true">✓</span>
                            Đã xác minh mua hàng
                        </small>
                        <small class="seo-review-payment">
                            ${escapeHtml(paymentMethodLabel(review.paymentMethod))}
                        </small>
                    </footer>
                ` : ''}
            </article>
        `;
    }

    function updateReviewSummary(summary) {
        const average = Number(summary?.average || 0);
        const count = Number(summary?.count || 0);
        const averageElement = document.getElementById(
            'seo-review-average'
        );
        const starsElement = document.getElementById(
            'seo-review-summary-stars'
        );
        const countElement = document.getElementById(
            'seo-review-count'
        );

        if (averageElement) {
            averageElement.textContent = average.toFixed(1);
        }
        if (starsElement) {
            starsElement.textContent = reviewStars(average);
        }
        if (countElement) {
            countElement.textContent = `${count} đánh giá`;
        }
    }

    function setupReviewForm() {
        const form = document.getElementById('seo-review-form');
        const productId = String(
            pageData.currentProductId || ''
        );

        if (!form || !productId) return;

        const ratingInput = form.querySelector(
            'input[name="rating"]'
        );
        const ratingButtons = Array.from(
            form.querySelectorAll('[data-review-rating]')
        );
        const message = document.getElementById(
            'seo-review-message'
        );
        const list = document.getElementById(
            'seo-review-list'
        );
        const submit = document.getElementById(
            'seo-review-submit'
        );

        function chooseRating(value) {
            const rating = Math.min(5, Math.max(1, Number(value || 5)));
            ratingInput.value = String(rating);
            ratingButtons.forEach(button => {
                button.classList.toggle(
                    'active',
                    Number(button.dataset.reviewRating) <= rating
                );
            });
        }

        ratingButtons.forEach(button => {
            button.addEventListener('click', () => {
                chooseRating(button.dataset.reviewRating);
            });
        });
        chooseRating(ratingInput.value || 5);

        form.addEventListener('submit', async event => {
            event.preventDefault();
            submit.disabled = true;
            submit.textContent = 'Đang xác minh đơn hàng...';
            message.textContent = '';
            message.className = 'seo-review-message';

            const formData = new FormData(form);
            const payload = {
                productId,
                orderCode: formData.get('orderCode'),
                phone: formData.get('phone'),
                reviewerName: formData.get('reviewerName'),
                rating: Number(formData.get('rating')),
                comment: formData.get('comment')
            };

            try {
                const response = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();

                if (!response.ok || data.success !== true) {
                    throw new Error(
                        data.message ||
                        'Không thể gửi đánh giá.'
                    );
                }

                if (list) {
                    list.querySelector('.seo-review-empty')?.remove();
                    list.insertAdjacentHTML(
                        'afterbegin',
                        renderReviewItem(data.review)
                    );
                }

                updateReviewSummary(data.summary);
                form.reset();
                chooseRating(5);
                message.textContent = data.message;
                message.classList.add('success');
                showToast('Đã đăng đánh giá thành công');
            } catch (error) {
                message.textContent = error.message;
                message.classList.add('error');
            } finally {
                submit.disabled = false;
                submit.textContent = 'Gửi đánh giá đã xác minh';
            }
        });
    }


    function setupResponsiveHeaderMenu() {
        const toggle = document.getElementById(
            'seo-menu-toggle'
        );
        const nav = document.getElementById(
            'seo-nav-menu'
        );

        if (!toggle || !nav) {
            return;
        }

        function setOpen(open) {
            const shouldOpen = Boolean(open);

            toggle.classList.toggle(
                'active',
                shouldOpen
            );
            nav.classList.toggle(
                'active',
                shouldOpen
            );
            document.body.classList.toggle(
                'seo-menu-open',
                shouldOpen
            );

            toggle.setAttribute(
                'aria-expanded',
                shouldOpen ? 'true' : 'false'
            );
            toggle.setAttribute(
                'aria-label',
                shouldOpen ? 'Đóng menu' : 'Mở menu'
            );
        }

        toggle.addEventListener('click', event => {
            event.stopPropagation();
            setOpen(!nav.classList.contains('active'));
        });

        nav.addEventListener('click', event => {
            if (event.target.closest('a')) {
                setOpen(false);
            }
        });

        document.addEventListener('click', event => {
            if (
                window.innerWidth > 980 ||
                !nav.classList.contains('active')
            ) {
                return;
            }

            if (
                !nav.contains(event.target) &&
                !toggle.contains(event.target)
            ) {
                setOpen(false);
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        });

        window.addEventListener(
            'resize',
            () => {
                if (window.innerWidth > 980) {
                    setOpen(false);
                }
            },
            { passive: true }
        );
    }

    setupResponsiveHeaderMenu();
    setupGallery();
    setupCategoryControls();
    setupGlobalProductSearch();
    setupReviewForm();
    updateDetailVariant();
    updateCartCount();
    renderCart();
    renderCheckoutSummary();
})();
