const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');

const BRAND_CONFIG = {
    'madame-huong': {
        slug: 'madame-huong',
        name: 'Madame Hương',
        kicker: 'Dấu ấn Hà Nội',
        heading: 'Thanh lịch và hoài niệm',
        description:
            'Toàn bộ hộp quà, bộ sưu tập và bánh Trung Thu bán lẻ Madame Hương được tuyển chọn tại Trung Thu Phố.',
        heroImage:
            'https://madamehuong.com.vn/wp-content/uploads/2025/08/banner-2.jpg'
    },
    maison: {
        slug: 'maison',
        name: 'Maison',
        kicker: 'Phong cách đương đại',
        heading: 'Sang trọng và khác biệt',
        description:
            'Toàn bộ bộ sưu tập và sản phẩm bánh Trung Thu Maison với ngôn ngữ quà tặng hiện đại, chỉn chu và sang trọng.',
        heroImage:
            'https://w.ladicdn.com/s700x600/6655429e096047001136c6f6/vanan1-20251217182630-qb_ek.jpg'
    }
};

function getSiteUrl() {
    return String(
        process.env.SITE_URL ||
        process.env.BASE_URL ||
        'https://nethanoi.com'
    ).replace(/\/+$/, '');
}

function slugify(value) {
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function safeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

function stripHtml(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(value, maxLength) {
    const clean = stripHtml(value);

    if (clean.length <= maxLength) {
        return clean;
    }

    return `${clean
        .slice(0, Math.max(0, maxLength - 1))
        .trim()}…`;
}

function getBrandSlug(productOrBrand) {
    const value =
        typeof productOrBrand === 'string'
            ? productOrBrand
            : (
                productOrBrand?.tag ||
                productOrBrand?.brand ||
                ''
            );

    return String(value)
        .toLowerCase()
        .includes('maison')
            ? 'maison'
            : 'madame-huong';
}

function getBrandConfig(productOrBrand) {
    return BRAND_CONFIG[getBrandSlug(productOrBrand)];
}

function getBrandName(product) {
    return getBrandConfig(product).name;
}

function categoryPath(productOrBrand) {
    return `/thuong-hieu/${getBrandSlug(productOrBrand)}`;
}

function productPath(product) {
    return (
        `/san-pham/${slugify(product?.name)}/` +
        `${product?._id}`
    );
}

function getProductImages(product) {
    const values = [
        ...(Array.isArray(product?.images)
            ? product.images
            : []),
        product?.image,
        product?.mainImage,
        product?.imageUrl,
        ...(Array.isArray(product?.options)
            ? product.options.map(option => option?.image)
            : [])
    ];

    return [...new Set(
        values
            .map(item => String(item || '').trim())
            .filter(Boolean)
    )].slice(0, 8);
}

function getProductOptions(product, images = []) {
    if (!Array.isArray(product?.options)) {
        return [];
    }

    return product.options
        .map((option, index) => {
            const rawImageIndex =
                option?.imageIndex ??
                option?.image_index ??
                option?.imageSlot;

            const parsedImageIndex =
                rawImageIndex === '' ||
                rawImageIndex === null ||
                rawImageIndex === undefined
                    ? null
                    : Number(rawImageIndex);

            const imageIndex =
                Number.isInteger(parsedImageIndex) &&
                parsedImageIndex >= 0 &&
                parsedImageIndex < images.length
                    ? parsedImageIndex
                    : null;

            return {
                size: String(
                    option?.size ||
                    option?.label ||
                    `Lựa chọn ${index + 1}`
                ).trim(),
                code: String(
                    option?.code ||
                    `${product?.code || 'SP'}-${index + 1}`
                ).trim(),
                price: Number(option?.price || 0),
                hsd: String(
                    option?.hsd ||
                    option?.expiry ||
                    ''
                ).trim(),
                imageIndex,
                image: String(
                    option?.image ||
                    (
                        imageIndex !== null
                            ? images[imageIndex]
                            : ''
                    ) ||
                    images[0] ||
                    ''
                ).trim()
            };
        })
        .filter(option => {
            return (
                option.size &&
                Number.isFinite(option.price) &&
                option.price > 0
            );
        });
}

function getProductPrices(product, options = []) {
    const prices = options
        .map(option => Number(option.price || 0))
        .filter(price => {
            return Number.isFinite(price) && price > 0;
        });

    const basePrice = Number(product?.price || 0);

    if (Number.isFinite(basePrice) && basePrice > 0) {
        prices.push(basePrice);
    }

    if (!prices.length) {
        return {
            min: 0,
            max: 0
        };
    }

    return {
        min: Math.min(...prices),
        max: Math.max(...prices)
    };
}

function getSoldCount(product) {
    return Math.max(
        0,
        Number(
            product?.soldCount ??
            product?.salesCount ??
            product?.totalSold ??
            product?.sold ??
            0
        ) || 0
    );
}

function getCategoryLabel(product) {
    return product?.isRetail
        ? 'Sản phẩm bán lẻ'
        : 'Hộp quà / Bộ sưu tập';
}

function formatCurrency(value) {
    return (
        Number(value || 0)
            .toLocaleString('vi-VN') +
        ' đ'
    );
}

function formatPriceRange(prices) {
    if (!prices.min && !prices.max) {
        return 'Liên hệ';
    }

    if (prices.min === prices.max) {
        return formatCurrency(prices.min);
    }

    return (
        `${formatCurrency(prices.min)} - ` +
        `${formatCurrency(prices.max)}`
    );
}

function absoluteUrl(value, siteUrl) {
    const source = String(value || '').trim();

    if (!source) {
        return `${siteUrl}/logo.png`;
    }

    if (/^https?:\/\//i.test(source)) {
        return source;
    }

    if (source.startsWith('data:')) {
        return source;
    }

    if (source.startsWith('/')) {
        return `${siteUrl}${source}`;
    }

    return (
        `${siteUrl}/` +
        source.replace(/^\.?\//, '')
    );
}

function seoImageUrl(value, siteUrl) {
    const source = absoluteUrl(value, siteUrl);

    if (
        /^https?:\/\//i.test(source) &&
        !source.startsWith('data:')
    ) {
        return source;
    }

    return `${siteUrl}/logo.png`;
}

function serializeProduct(product) {
    const siteUrl = getSiteUrl();
    const rawImages = getProductImages(product);
    const images = rawImages.map(image => {
        return absoluteUrl(image, siteUrl);
    });
    const options = getProductOptions(
        product,
        rawImages
    ).map(option => ({
        ...option,
        image: absoluteUrl(
            option.image || rawImages[0],
            siteUrl
        )
    }));
    const prices = getProductPrices(product, options);
    const brandConfig = getBrandConfig(product);

    return {
        id: String(product._id),
        catalogProductId: String(product._id),
        baseId: String(product.code || product._id),
        code: String(product.code || product._id),
        name: String(product.name || 'Sản phẩm'),
        description: String(
            product.description ||
            product.desc ||
            ''
        ),
        brand: brandConfig.name,
        brandSlug: brandConfig.slug,
        categoryUrl: categoryPath(product),
        productUrl: productPath(product),
        categoryLabel: getCategoryLabel(product),
        isRetail: Boolean(product.isRetail),
        isSpecial: Boolean(product.isSpecial),
        soldCount: getSoldCount(product),
        sortOrder: Number(product.sortOrder || 0),
        tags: Array.isArray(product.tags)
            ? product.tags.filter(Boolean).slice(0, 12)
            : [],
        images,
        options,
        optionLabel: String(
            product.optionLabel ||
            'Chọn quy cách'
        ),
        price: Number(product.price || 0),
        prices,
        priceText: formatPriceRange(prices)
    };
}

function buildProductStructuredData(product, serialized, reviewSummary = null) {
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}${serialized.productUrl}`;
    const description = truncate(
        serialized.description ||
        `${serialized.name} thuộc bộ sưu tập bánh Trung Thu ${serialized.brand}.`,
        1200
    );
    const common = {
        '@context': 'https://schema.org',
        name: serialized.name,
        description,
        url: canonicalUrl,
        image: serialized.images
            .map(image => seoImageUrl(image, siteUrl)),
        brand: {
            '@type': 'Brand',
            name: serialized.brand
        },
        ...(reviewSummary && Number(reviewSummary.count || 0) > 0
            ? {
                aggregateRating: {
                    '@type': 'AggregateRating',
                    ratingValue: Number(reviewSummary.average || 0),
                    reviewCount: Number(reviewSummary.count || 0),
                    bestRating: 5,
                    worstRating: 1
                }
            }
            : {})
    };

    if (serialized.options.length > 1) {
        return {
            ...common,
            '@type': 'ProductGroup',
            productGroupID:
                serialized.code ||
                serialized.id,
            variesBy: [
                'https://schema.org/size'
            ],
            hasVariant: serialized.options.map(option => ({
                '@type': 'Product',
                name:
                    `${serialized.name} - ` +
                    `${option.size}`,
                sku: option.code,
                size: option.size,
                image: seoImageUrl(
                    option.image || serialized.images[0],
                    siteUrl
                ),
                offers: {
                    '@type': 'Offer',
                    url:
                        `${canonicalUrl}?variant=` +
                        encodeURIComponent(option.code),
                    priceCurrency: 'VND',
                    price: option.price,
                    availability:
                        'https://schema.org/InStock',
                    itemCondition:
                        'https://schema.org/NewCondition'
                }
            }))
        };
    }

    const option = serialized.options[0];

    return {
        ...common,
        '@type': 'Product',
        sku:
            option?.code ||
            serialized.code ||
            serialized.id,
        offers: {
            '@type': 'Offer',
            url: canonicalUrl,
            priceCurrency: 'VND',
            price:
                option?.price ||
                serialized.prices.min ||
                serialized.price,
            availability:
                'https://schema.org/InStock',
            itemCondition:
                'https://schema.org/NewCondition'
        }
    };
}

function renderHead({
    title,
    description,
    canonicalUrl,
    imageUrl,
    type = 'website',
    structuredData = []
}) {
    return `
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >
    <title>${escapeHtml(title)}</title>
    <meta
        name="description"
        content="${escapeHtml(description)}"
    >
    <meta
        name="robots"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    >
    <link
        rel="canonical"
        href="${escapeHtml(canonicalUrl)}"
    >
    <link
        rel="icon"
        href="/logo.png"
        type="image/png"
    >
    <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
    >
    <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin
    >
    <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
    >
    <link
        rel="stylesheet"
        href="/seo-store.css?v=5"
    >

    <meta property="og:locale" content="vi_VN">
    <meta property="og:type" content="${escapeHtml(type)}">
    <meta property="og:site_name" content="Trung Thu Phố">
    <meta
        property="og:title"
        content="${escapeHtml(title)}"
    >
    <meta
        property="og:description"
        content="${escapeHtml(description)}"
    >
    <meta
        property="og:url"
        content="${escapeHtml(canonicalUrl)}"
    >
    <meta
        property="og:image"
        content="${escapeHtml(imageUrl)}"
    >

    <meta
        name="twitter:card"
        content="summary_large_image"
    >
    <meta
        name="twitter:title"
        content="${escapeHtml(title)}"
    >
    <meta
        name="twitter:description"
        content="${escapeHtml(description)}"
    >
    <meta
        name="twitter:image"
        content="${escapeHtml(imageUrl)}"
    >

    ${structuredData.map(data => `
    <script type="application/ld+json">
        ${safeJson(data)}
    </script>`).join('')}
    `;
}

function renderHeader(activeBrand = '') {
    return `
    <header class="seo-header" id="seo-header">
        <div class="seo-header-shell">
            <a
                class="seo-brand"
                href="/?skipIntro=1"
                aria-label="Trung Thu Phố"
            >
                <img
                    src="/logo.png"
                    alt="Logo Nét Hà Nội"
                    width="124"
                    height="108"
                >
                <span class="seo-brand-copy">
                    <strong>NÉT HÀ NỘI</strong>
                    <small>Madame Hương <i>•</i> Maison</small>
                </span>
            </a>

            <nav class="seo-nav" id="seo-nav-menu" aria-label="Điều hướng chính">
                <a href="/?skipIntro=1">Trang chủ</a>
                <a
                    href="/thuong-hieu/madame-huong"
                    class="${activeBrand === 'madame-huong' ? 'active' : ''}"
                >Madame Hương</a>
                <a
                    href="/thuong-hieu/maison"
                    class="${activeBrand === 'maison' ? 'active' : ''}"
                >Maison</a>
                <a href="/#about-story">Câu chuyện</a>
                <a href="/#footer">Liên hệ</a>
            </nav>

            <div class="seo-header-tools">
                <div class="seo-site-search">
                    <label class="seo-site-search-field">
                        <span aria-hidden="true">⌕</span>
                        <input
                            id="seo-site-search-input"
                            type="search"
                            placeholder="Tìm sản phẩm..."
                            autocomplete="off"
                            aria-label="Tìm kiếm sản phẩm"
                            aria-expanded="false"
                            aria-controls="seo-site-search-results"
                        >
                    </label>
                    <div
                        id="seo-site-search-results"
                        class="seo-site-search-results"
                        role="listbox"
                        hidden
                    ></div>
                </div>

                <button
                    class="seo-cart-button"
                    type="button"
                    data-open-cart
                    aria-label="Mở giỏ hàng"
                >
                    <span>Giỏ hàng</span>
                    <b data-cart-count>0</b>
                </button>
            </div>

            <button
                class="seo-menu-toggle"
                id="seo-menu-toggle"
                type="button"
                aria-label="Mở menu"
                aria-controls="seo-nav-menu"
                aria-expanded="false"
            >
                <span></span>
                <span></span>
                <span></span>
            </button>
        </div>
    </header>
    `;
}

function renderFooter() {
    return `
    <footer class="seo-footer">
        <div class="seo-footer-grid">
            <section>
                <h3>Trung Thu Phố</h3>
                <p>
                    Điểm bán tuyển chọn bánh Trung Thu
                    Madame Hương và Maison tại Hà Nội.
                </p>
            </section>

            <section>
                <h3>Thương hiệu</h3>
                <p>
                    <a href="/thuong-hieu/madame-huong">
                        Madame Hương
                    </a>
                </p>
                <p>
                    <a href="/thuong-hieu/maison">
                        Maison
                    </a>
                </p>
            </section>

            <section>
                <h3>Liên hệ</h3>
                <p>
                    39 Lý Thường Kiệt,
                    Hoàn Kiếm, Hà Nội
                </p>
                <p>
                    Hotline: 08 1800 6466
                </p>
            </section>
        </div>
    </footer>
    `;
}

function renderCommerceModals() {
    return `
    <div
        class="seo-modal"
        id="seo-cart-modal"
        aria-hidden="true"
    >
        <section
            class="seo-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seo-cart-title"
        >
            <button
                class="seo-modal-close"
                type="button"
                data-close-modal
                aria-label="Đóng"
            >&times;</button>

            <header class="seo-modal-head">
                <h2 id="seo-cart-title">Giỏ hàng</h2>
                <p>
                    Giỏ hàng được giữ nguyên khi chuyển
                    giữa trang chủ, sản phẩm và thương hiệu.
                </p>
            </header>

            <div class="seo-modal-body">
                <div
                    class="seo-cart-list"
                    id="seo-cart-list"
                ></div>

                <div class="seo-cart-total">
                    <span>Tổng cộng</span>
                    <strong id="seo-cart-total">0 đ</strong>
                </div>

                <div class="seo-modal-actions">
                    <button
                        class="seo-btn"
                        type="button"
                        data-close-modal
                    >Tiếp tục xem</button>
                    <button
                        class="seo-btn seo-btn-primary"
                        type="button"
                        id="seo-open-checkout"
                    >Tiến hành đặt hàng</button>
                </div>
            </div>
        </section>
    </div>

    <div
        class="seo-modal"
        id="seo-checkout-modal"
        aria-hidden="true"
    >
        <section
            class="seo-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seo-checkout-title"
        >
            <button
                class="seo-modal-close"
                type="button"
                data-close-modal
                aria-label="Đóng"
            >&times;</button>

            <header class="seo-modal-head">
                <h2 id="seo-checkout-title">
                    Thông tin đặt hàng
                </h2>
                <p>
                    Đặt hàng trực tiếp tại trang hiện tại,
                    không cần quay về trang chủ.
                </p>
            </header>

            <div class="seo-modal-body">
                <div
                    class="seo-checkout-summary"
                    id="seo-checkout-summary"
                ></div>

                <form
                    id="seo-checkout-form"
                    class="seo-form-grid"
                >
                    <div class="seo-form-group">
                        <label for="seo-c-name">Họ và tên</label>
                        <input
                            id="seo-c-name"
                            type="text"
                            required
                        >
                    </div>

                    <div class="seo-form-group">
                        <label for="seo-c-phone">Số điện thoại</label>
                        <input
                            id="seo-c-phone"
                            type="tel"
                            inputmode="tel"
                            required
                        >
                    </div>

                    <div class="seo-form-group">
                        <label for="seo-c-address">Địa chỉ nhận hàng</label>
                        <textarea
                            id="seo-c-address"
                            required
                        ></textarea>
                    </div>

                    <div class="seo-form-group">
                        <label for="seo-c-payment">Phương thức thanh toán</label>
                        <select id="seo-c-payment">
                            <option value="COD">
                                Thanh toán khi nhận hàng
                            </option>
                            <option value="VNPAY">
                                Thanh toán VNPay
                            </option>
                        </select>
                    </div>

                    <button
                        class="seo-btn seo-btn-primary"
                        type="submit"
                        id="seo-checkout-submit"
                    >Xác nhận đặt hàng</button>
                </form>
            </div>
        </section>
    </div>

    <div
        class="seo-modal"
        id="seo-success-modal"
        aria-hidden="true"
    >
        <section
            class="seo-modal-panel seo-success-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seo-success-title"
        >
            <button
                class="seo-modal-close"
                type="button"
                data-close-modal
                aria-label="Đóng"
            >&times;</button>

            <div class="seo-modal-body seo-success-box">
                <div class="seo-success-icon">✓</div>
                <h2 id="seo-success-title">
                    Đặt hàng thành công
                </h2>
                <p>
                    Vui lòng lưu lại mã đơn để tiện
                    tra cứu và liên hệ CSKH.
                </p>
                <div
                    class="seo-success-code"
                    id="seo-success-order-code"
                >---</div>
                <button
                    class="seo-btn seo-btn-primary"
                    type="button"
                    id="seo-copy-order-code"
                >Sao chép mã đơn</button>
            </div>
        </section>
    </div>

    <div class="seo-floating-contact" aria-label="Liên hệ nhanh">
        <a
            class="seo-contact-zalo"
            href="https://zalo.me/0818006466"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Nhắn Zalo chăm sóc khách hàng"
        >
            <span class="seo-zalo-logo-text">Zalo</span>
        </a>

        <a
            class="seo-contact-hotline"
            href="tel:0818006466"
            aria-label="Gọi hotline 08 1800 6466"
        >
            <span class="seo-hotline-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.61 21 3 13.39 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.24.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
            </span>
            <span class="seo-hotline-content">
                <strong>08 1800 6466</strong>
                <small>Bấm gọi ngay</small>
            </span>
        </a>
    </div>

    <button
        class="seo-floating-cart"
        type="button"
        data-open-cart
        aria-label="Mở giỏ hàng"
    >
        <span class="seo-floating-cart-icon" aria-hidden="true">🛒</span>
        <span class="seo-floating-cart-label">Giỏ hàng</span>
        <b data-cart-count>0</b>
    </button>

    <div
        class="seo-toast"
        id="seo-toast"
        role="status"
        aria-live="polite"
    ></div>
    `;
}

function renderTags(tags) {
    if (!Array.isArray(tags) || !tags.length) {
        return '';
    }

    return `
        <div class="seo-tags">
            ${tags.map(tag => `
                <span>${escapeHtml(tag)}</span>
            `).join('')}
        </div>
    `;
}

function renderCatalogCard(product, { related = false } = {}) {
    const image = product.images[0] || '/logo.png';
    const quickAction =
        product.options.length > 1
            ? `
                <a
                    class="seo-btn seo-btn-wine"
                    href="${escapeHtml(product.productUrl)}#chon-quy-cach"
                >Chọn loại</a>
            `
            : `
                <button
                    class="seo-btn seo-btn-wine"
                    type="button"
                    data-quick-add="${escapeHtml(product.id)}"
                >Thêm giỏ</button>
            `;

    return `
    <article
        class="seo-product-card"
        data-catalog-card
        data-retail="${product.isRetail ? 'true' : 'false'}"
        data-price="${product.prices.min || 0}"
        data-sold="${product.soldCount || 0}"
        data-name="${escapeHtml(product.name.toLowerCase())}"
    >
        <a
            class="seo-product-media"
            href="${escapeHtml(product.productUrl)}"
            aria-label="Xem chi tiết ${escapeHtml(product.name)}"
        >
            <img
                src="${escapeHtml(image)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
                decoding="async"
            >
            <span class="seo-product-type">
                ${escapeHtml(product.categoryLabel)}
            </span>
            ${product.isSpecial ? `
                <span class="seo-special-pill">Đặc biệt</span>
            ` : ''}
        </a>

        <div class="seo-product-content">
            <a
                class="seo-product-brand"
                href="${escapeHtml(product.categoryUrl)}"
            >${escapeHtml(product.brand)}</a>

            <h3>
                <a href="${escapeHtml(product.productUrl)}">
                    ${escapeHtml(product.name)}
                </a>
            </h3>

            <p class="seo-product-desc">
                ${escapeHtml(
                    truncate(
                        product.description ||
                        'Thông tin sản phẩm đang được cập nhật.',
                        related ? 125 : 165
                    )
                )}
            </p>

            ${renderTags(product.tags.slice(0, 4))}

            <p class="seo-product-sales">
                ${product.soldCount > 0
                    ? `Đã bán ${product.soldCount.toLocaleString('vi-VN')} sản phẩm`
                    : 'Sản phẩm tuyển chọn'}
            </p>

            <p class="seo-product-price">
                ${escapeHtml(product.priceText)}
            </p>

            <div class="seo-product-actions">
                <a
                    class="seo-btn"
                    href="${escapeHtml(product.productUrl)}"
                >Xem chi tiết</a>
                ${quickAction}
            </div>
        </div>
    </article>
    `;
}

function renderReviewStars(rating) {
    const rounded = Math.round(Number(rating || 0));

    return Array.from({ length: 5 }, (_, index) => {
        return index < rounded ? '★' : '☆';
    }).join('');
}

function serializeReviewForPage(review) {
    return {
        id: String(review._id),
        reviewerName: String(review.reviewerName || 'Khách hàng'),
        rating: Number(review.rating || 0),
        comment: String(review.comment || ''),
        verifiedPurchase: review.verifiedPurchase === true,
        paymentMethod: String(review.paymentMethod || 'COD'),
        createdAt: review.createdAt
    };
}

function renderReviewCard(review) {
    const date = review.createdAt
        ? new Date(review.createdAt).toLocaleDateString('vi-VN')
        : '';
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
                        <span>${escapeHtml(date)}</span>
                    </div>
                </div>
                <div class="seo-review-stars" aria-label="${review.rating} trên 5 sao">
                    ${renderReviewStars(review.rating)}
                </div>
            </div>
            <p>${escapeHtml(review.comment).replace(/\n/g, '<br>')}</p>
            ${review.verifiedPurchase ? `
                <footer class="seo-review-card-footer">
                    <small class="seo-verified-review">
                        <span aria-hidden="true">✓</span>
                        Đã xác minh mua hàng
                    </small>
                    <small class="seo-review-payment">
                        ${escapeHtml(review.paymentMethod)}
                    </small>
                </footer>
            ` : ''}
        </article>
    `;
}

function renderProductPageHtml({
    product,
    serialized,
    relatedProducts,
    reviews,
    reviewSummary
}) {
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}${serialized.productUrl}`;
    const categoryUrl = serialized.categoryUrl;
    const description =
        serialized.description ||
        `${serialized.name} thuộc bộ sưu tập bánh Trung Thu ${serialized.brand}.`;
    const metaDescription = truncate(
        `${serialized.name} của ${serialized.brand}. ${description}`,
        158
    );
    const title =
        `${serialized.name} - ${serialized.brand} | Trung Thu Phố`;
    const socialImage = seoImageUrl(
        serialized.images[0],
        siteUrl
    );
    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Trang chủ',
                item: `${siteUrl}/`
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: serialized.brand,
                item: `${siteUrl}${categoryUrl}`
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: serialized.name,
                item: canonicalUrl
            }
        ]
    };
    const gallery = serialized.images.length
        ? serialized.images
        : [`${siteUrl}/logo.png`];
    const optionPrice =
        serialized.options[0]?.price ||
        serialized.prices.min ||
        serialized.price;
    const optionCode =
        serialized.options[0]?.code ||
        serialized.code;
    const optionSize =
        serialized.options[0]?.size ||
        'Tiêu chuẩn';
    const optionHsd =
        serialized.options[0]?.hsd ||
        'Theo thông tin nhà sản xuất';

    return `<!DOCTYPE html>
<html lang="vi">
<head>
${renderHead({
    title,
    description: metaDescription,
    canonicalUrl,
    imageUrl: socialImage,
    type: 'product',
    structuredData: [
        buildProductStructuredData(product, serialized, reviewSummary),
        breadcrumb
    ]
})}
</head>
<body>
    ${renderHeader(serialized.brandSlug)}

    <main class="seo-page">
        <nav class="seo-breadcrumb" aria-label="Breadcrumb">
            <a href="/?skipIntro=1">Trang chủ</a>
            <span>/</span>
            <a href="${escapeHtml(categoryUrl)}">
                ${escapeHtml(serialized.brand)}
            </a>
            <span>/</span>
            <span>${escapeHtml(serialized.name)}</span>
        </nav>

        <article class="seo-product-detail">
            <section class="seo-gallery" aria-label="Ảnh sản phẩm">
                <div class="seo-main-image">
                    <img
                        id="seo-main-product-image"
                        src="${escapeHtml(gallery[0])}"
                        alt="${escapeHtml(serialized.name)}"
                        width="1200"
                        height="900"
                        fetchpriority="high"
                    >
                </div>

                <div class="seo-thumbnails">
                    ${gallery.map((image, index) => `
                        <button
                            type="button"
                            class="seo-thumb ${index === 0 ? 'active' : ''}"
                            data-gallery-image="${escapeHtml(image)}"
                            aria-label="Xem ảnh ${index + 1}"
                        >
                            <img
                                src="${escapeHtml(image)}"
                                alt="${escapeHtml(serialized.name)} - ảnh ${index + 1}"
                                loading="${index === 0 ? 'eager' : 'lazy'}"
                            >
                        </button>
                    `).join('')}
                </div>
            </section>

            <section class="seo-detail-copy">
                <a
                    class="seo-brand-pill"
                    href="${escapeHtml(categoryUrl)}"
                >${escapeHtml(serialized.brand)}</a>

                <h1>${escapeHtml(serialized.name)}</h1>

                <a class="seo-inline-rating" href="#danh-gia">
                    <span>${renderReviewStars(reviewSummary?.average || 0)}</span>
                    <strong>${Number(reviewSummary?.average || 0).toFixed(1)}</strong>
                    <small>(${Number(reviewSummary?.count || 0)} đánh giá đã xác minh)</small>
                </a>

                ${renderTags(serialized.tags)}

                <p
                    class="seo-detail-price"
                    id="seo-detail-price"
                >${escapeHtml(serialized.priceText)}</p>

                <div class="seo-detail-description">
                    ${escapeHtml(description).replace(/\n/g, '<br>')}
                </div>

                ${serialized.options.length ? `
                    <section
                        class="seo-variant-section"
                        id="chon-quy-cach"
                    >
                        <p class="seo-detail-label">
                            ${escapeHtml(serialized.optionLabel)}
                        </p>
                        <div class="seo-variant-list">
                            ${serialized.options.map((option, index) => `
                                <button
                                    type="button"
                                    class="seo-variant ${index === 0 ? 'active' : ''}"
                                    data-detail-variant="${index}"
                                >
                                    <strong>${escapeHtml(option.size)}</strong>
                                    <span>${escapeHtml(formatCurrency(option.price))}</span>
                                </button>
                            `).join('')}
                        </div>
                    </section>
                ` : ''}

                <div class="seo-product-facts">
                    <div>
                        <span>Thương hiệu</span>
                        <strong>${escapeHtml(serialized.brand)}</strong>
                    </div>
                    <div>
                        <span>Nhóm sản phẩm</span>
                        <strong>${escapeHtml(serialized.categoryLabel)}</strong>
                    </div>
                    <div>
                        <span>Mã sản phẩm</span>
                        <strong id="seo-detail-code">
                            ${escapeHtml(optionCode)}
                        </strong>
                    </div>
                    <div>
                        <span>Quy cách</span>
                        <strong id="seo-detail-option">
                            ${escapeHtml(optionSize)}
                        </strong>
                    </div>
                    <div>
                        <span>Hạn sử dụng</span>
                        <strong id="seo-detail-hsd">
                            ${escapeHtml(optionHsd)}
                        </strong>
                    </div>
                    <div>
                        <span>Tình trạng</span>
                        <strong>Sẵn sàng đặt hàng</strong>
                    </div>
                </div>

                <div class="seo-quantity-row">
                    <span>Số lượng</span>
                    <div class="seo-qty">
                        <button
                            type="button"
                            data-detail-qty="-1"
                        >−</button>
                        <strong id="seo-detail-qty">1</strong>
                        <button
                            type="button"
                            data-detail-qty="1"
                        >+</button>
                    </div>
                </div>

                <div class="seo-detail-actions">
                    <button
                        class="seo-btn seo-btn-wine"
                        type="button"
                        data-add-detail-cart
                    >Thêm vào giỏ hàng</button>
                    <button
                        class="seo-btn seo-btn-primary"
                        type="button"
                        data-buy-detail-now
                    >Đặt hàng ngay</button>
                </div>

                <a
                    class="seo-category-link"
                    href="${escapeHtml(categoryUrl)}"
                >
                    Xem toàn bộ sản phẩm ${escapeHtml(serialized.brand)}
                    <span>→</span>
                </a>
            </section>
        </article>

        <section class="seo-reviews-section" id="danh-gia">
            <div class="seo-review-frame">
                <header class="seo-section-heading seo-review-heading">
                    <span>Đánh giá đã xác minh</span>
                    <h2>Khách hàng nói gì về sản phẩm</h2>
                    <p>
                        Chỉ đơn VNPay đã thanh toán hoặc đơn COD đã được
                        xác nhận giao thành công mới có thể gửi đánh giá.
                    </p>
                </header>

                <div class="seo-review-layout">
                    <aside class="seo-review-summary-card">
                        <span class="seo-review-summary-kicker">Điểm đánh giá</span>
                        <strong
                            class="seo-review-average"
                            id="seo-review-average"
                        >${Number(reviewSummary?.average || 0).toFixed(1)}</strong>
                        <div
                            class="seo-review-stars seo-review-stars-large"
                            id="seo-review-summary-stars"
                        >${renderReviewStars(reviewSummary?.average || 0)}</div>
                        <span class="seo-review-count-label" id="seo-review-count">
                            ${Number(reviewSummary?.count || 0)} đánh giá
                        </span>
                        <div class="seo-review-trust-line">
                            <span aria-hidden="true">✓</span>
                            <p>
                                Tất cả nhận xét đều được xác thực từ đơn hàng
                                đã thanh toán hoặc đã giao thành công.
                            </p>
                        </div>
                    </aside>

                    <form
                        class="seo-review-form"
                        id="seo-review-form"
                    >
                        <div class="seo-review-form-title">
                            <div>
                                <span class="seo-review-form-kicker">Chia sẻ trải nghiệm</span>
                                <strong>Viết đánh giá của bạn</strong>
                            </div>
                            <span class="seo-review-form-note">
                                Nhập đúng mã đơn và số điện thoại đã đặt hàng.
                            </span>
                        </div>

                        <div class="seo-review-form-grid">
                            <label>
                                <span>Mã đơn hàng</span>
                                <input
                                    name="orderCode"
                                    type="text"
                                    placeholder="VD: MH20260616ABC123"
                                    autocomplete="off"
                                    required
                                >
                            </label>
                            <label>
                                <span>Số điện thoại đặt hàng</span>
                                <input
                                    name="phone"
                                    type="tel"
                                    inputmode="tel"
                                    placeholder="VD: 0818006466"
                                    autocomplete="tel"
                                    required
                                >
                            </label>
                            <label>
                                <span>Tên hiển thị</span>
                                <input
                                    name="reviewerName"
                                    type="text"
                                    maxlength="80"
                                    placeholder="Tên của bạn"
                                    autocomplete="name"
                                >
                            </label>
                        </div>

                        <div class="seo-review-rating-row">
                            <fieldset class="seo-rating-picker">
                                <legend>Chọn số sao</legend>
                                <input type="hidden" name="rating" value="5">
                                <div role="radiogroup" aria-label="Chọn số sao">
                                    ${[1, 2, 3, 4, 5].map(value => `
                                        <button
                                            type="button"
                                            class="${value <= 5 ? 'active' : ''}"
                                            data-review-rating="${value}"
                                            aria-label="${value} sao"
                                        >★</button>
                                    `).join('')}
                                </div>
                            </fieldset>
                            <span class="seo-review-rating-hint">
                                Chạm vào số sao để chọn mức đánh giá
                            </span>
                        </div>

                        <label class="seo-review-comment">
                            <span>Nội dung đánh giá</span>
                            <textarea
                                name="comment"
                                minlength="10"
                                maxlength="1200"
                                placeholder="Chia sẻ cảm nhận thực tế về sản phẩm, hương vị, bao bì hoặc dịch vụ giao hàng..."
                                required
                            ></textarea>
                        </label>

                        <div class="seo-review-submit-row">
                            <button
                                class="seo-btn seo-btn-primary"
                                type="submit"
                                id="seo-review-submit"
                            >Gửi đánh giá đã xác minh</button>
                            <p
                                class="seo-review-message"
                                id="seo-review-message"
                                role="status"
                            ></p>
                        </div>
                    </form>
                </div>

                <div class="seo-review-feed-heading">
                    <div>
                        <span>Nhận xét gần đây</span>
                        <h3>Đánh giá từ khách đã mua hàng</h3>
                    </div>
                    <span class="seo-review-feed-count">
                        ${Number(reviewSummary?.count || 0)} nhận xét
                    </span>
                </div>

                <div
                    class="seo-review-list"
                    id="seo-review-list"
                >
                    ${reviews.length
                        ? reviews.map(renderReviewCard).join('')
                        : `
                            <div class="seo-review-empty">
                                <span class="seo-review-empty-icon" aria-hidden="true">☆</span>
                                <strong>Chưa có đánh giá nào</strong>
                                <p>
                                    Khách hàng đã mua sản phẩm có thể là người
                                    đầu tiên chia sẻ trải nghiệm thực tế.
                                </p>
                            </div>
                        `}
                </div>
            </div>
        </section>

        <section class="seo-related-section">
            <header class="seo-section-heading">
                <span>Sản phẩm cùng thương hiệu</span>
                <h2>
                    Khám phá thêm ${escapeHtml(serialized.brand)}
                </h2>
                <p>
                    Bao gồm cả hộp quà, bộ sưu tập và
                    sản phẩm bánh bán lẻ cùng thương hiệu.
                </p>
            </header>

            <div class="seo-product-grid">
                ${relatedProducts.map(item => {
                    return renderCatalogCard(item, {
                        related: true
                    });
                }).join('')}
            </div>

            <div class="seo-center-action">
                <a
                    class="seo-btn seo-btn-primary"
                    href="${escapeHtml(categoryUrl)}"
                >Xem tất cả ${escapeHtml(serialized.brand)}</a>
            </div>
        </section>
    </main>

    ${renderFooter()}
    ${renderCommerceModals()}

    <script>
        window.SEO_STORE_DATA = ${safeJson({
            pageType: 'product',
            currentProductId: serialized.id,
            reviewSummary,
            reviews,
            products: [serialized, ...relatedProducts]
        })};
    </script>
    <script src="/seo-store.js?v=5" defer></script>
</body>
</html>`;
}

function renderCategoryPageHtml({
    brandConfig,
    products
}) {
    const siteUrl = getSiteUrl();
    const canonicalUrl =
        `${siteUrl}/thuong-hieu/${brandConfig.slug}`;
    const title =
        `Bánh Trung Thu ${brandConfig.name} tại Hà Nội | Trung Thu Phố`;
    const description = truncate(
        brandConfig.description,
        158
    );
    const imageUrl = seoImageUrl(
        brandConfig.heroImage,
        siteUrl
    );
    const collectionData = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        isPartOf: {
            '@type': 'WebSite',
            name: 'Trung Thu Phố',
            url: `${siteUrl}/`
        },
        mainEntity: {
            '@type': 'ItemList',
            numberOfItems: products.length,
            itemListElement: products.map((product, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: product.name,
                url: `${siteUrl}${product.productUrl}`
            }))
        }
    };
    const giftCount = products.filter(item => !item.isRetail).length;
    const retailCount = products.filter(item => item.isRetail).length;

    return `<!DOCTYPE html>
<html lang="vi">
<head>
${renderHead({
    title,
    description,
    canonicalUrl,
    imageUrl,
    structuredData: [collectionData]
})}
</head>
<body>
    ${renderHeader(brandConfig.slug)}

    <main>
        <section
            class="seo-category-hero"
            style="--category-hero-image: url('${escapeHtml(brandConfig.heroImage)}')"
        >
            <div class="seo-category-overlay"></div>
            <div class="seo-category-hero-content">
                <span>${escapeHtml(brandConfig.kicker)}</span>
                <h1>${escapeHtml(brandConfig.name)}</h1>
                <h2>${escapeHtml(brandConfig.heading)}</h2>
                <p>${escapeHtml(brandConfig.description)}</p>
                <div class="seo-category-stats">
                    <div>
                        <strong>${products.length}</strong>
                        <span>Tất cả sản phẩm</span>
                    </div>
                    <div>
                        <strong>${giftCount}</strong>
                        <span>Hộp quà</span>
                    </div>
                    <div>
                        <strong>${retailCount}</strong>
                        <span>Bánh bán lẻ</span>
                    </div>
                </div>
            </div>
        </section>

        <section class="seo-page seo-category-products">
            <nav class="seo-breadcrumb" aria-label="Breadcrumb">
                <a href="/?skipIntro=1">Trang chủ</a>
                <span>/</span>
                <span>${escapeHtml(brandConfig.name)}</span>
            </nav>

            <header class="seo-section-heading">
                <span>Tuyển chọn đầy đủ</span>
                <h2>
                    Toàn bộ sản phẩm ${escapeHtml(brandConfig.name)}
                </h2>
                <p>
                    Trang này hiển thị cả hộp quà, bộ sưu tập
                    và toàn bộ bánh bán lẻ của thương hiệu.
                </p>
            </header>

            <div class="seo-catalog-toolbar">
                <div class="seo-filter-tabs" role="tablist">
                    <button
                        type="button"
                        class="active"
                        data-category-filter="all"
                    >Tất cả</button>
                    <button
                        type="button"
                        data-category-filter="gift"
                    >Hộp quà</button>
                    <button
                        type="button"
                        data-category-filter="retail"
                    >Bánh bán lẻ</button>
                </div>

                <label class="seo-sort-wrap">
                    <span>Sắp xếp</span>
                    <select id="seo-category-sort">
                        <option value="popular">
                            Phổ biến nhất
                        </option>
                        <option value="price-asc">
                            Giá thấp đến cao
                        </option>
                        <option value="price-desc">
                            Giá cao đến thấp
                        </option>
                        <option value="name">
                            Theo tên sản phẩm
                        </option>
                    </select>
                </label>
            </div>

            <div
                class="seo-product-grid"
                id="seo-category-grid"
            >
                ${products.map(product => {
                    return renderCatalogCard(product);
                }).join('')}
            </div>

            <div
                class="seo-empty-category"
                id="seo-empty-category"
                hidden
            >
                Chưa có sản phẩm phù hợp trong nhóm này.
            </div>
        </section>
    </main>

    ${renderFooter()}
    ${renderCommerceModals()}

    <script>
        window.SEO_STORE_DATA = ${safeJson({
            pageType: 'category',
            currentBrand: brandConfig.slug,
            products
        })};
    </script>
    <script src="/seo-store.js?v=5" defer></script>
</body>
</html>`;
}

function renderNotFoundPage() {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >
    <meta name="robots" content="noindex, nofollow">
    <title>Không tìm thấy nội dung | Trung Thu Phố</title>
    <link rel="stylesheet" href="/seo-store.css?v=5">
</head>
<body>
    ${renderHeader()}
    <main class="seo-not-found">
        <h1>Không tìm thấy nội dung</h1>
        <p>
            Sản phẩm hoặc thương hiệu có thể đã được ẩn,
            xóa hoặc đường dẫn không còn chính xác.
        </p>
        <a class="seo-btn seo-btn-primary" href="/">
            Về trang chủ
        </a>
    </main>
</body>
</html>`;
}

exports.renderProductPage = async (req, res, next) => {
    try {
        const productId = String(req.params.id || '');

        if (!mongoose.isValidObjectId(productId)) {
            return res
                .status(404)
                .send(renderNotFoundPage());
        }

        const product = await Product.findOne({
            _id: productId,
            active: { $ne: false }
        }).lean();

        if (!product) {
            return res
                .status(404)
                .send(renderNotFoundPage());
        }

        const expectedSlug = slugify(product.name);

        if (req.params.slug !== expectedSlug) {
            return res.redirect(
                301,
                productPath(product)
            );
        }

        const serialized = serializeProduct(product);

        const relatedRaw = await Product.find({
            _id: { $ne: product._id },
            active: { $ne: false },
            tag: getBrandSlug(product)
        })
            .sort({
                soldCount: -1,
                sortOrder: 1,
                createdAt: -1
            })
            .limit(6)
            .lean();

        const relatedProducts = relatedRaw
            .map(serializeProduct)
            .sort((left, right) => {
                return (
                    right.soldCount - left.soldCount ||
                    left.sortOrder - right.sortOrder ||
                    left.name.localeCompare(right.name, 'vi')
                );
            });

        const reviewMatch = {
            product: new mongoose.Types.ObjectId(productId),
            approved: true
        };

        const [reviewsRaw, reviewAggregate] = await Promise.all([
            Review.find(reviewMatch)
                .sort({ createdAt: -1 })
                .limit(20)
                .lean(),
            Review.aggregate([
                { $match: reviewMatch },
                {
                    $group: {
                        _id: '$product',
                        count: { $sum: 1 },
                        average: { $avg: '$rating' }
                    }
                }
            ])
        ]);

        const reviews = reviewsRaw.map(serializeReviewForPage);
        const reviewSummary = reviewAggregate.length
            ? {
                count: Number(reviewAggregate[0].count || 0),
                average: Number(
                    Number(reviewAggregate[0].average || 0).toFixed(1)
                )
            }
            : {
                count: 0,
                average: 0
            };

        return res
            .status(200)
            .type('html')
            .send(renderProductPageHtml({
                product,
                serialized,
                relatedProducts,
                reviews,
                reviewSummary
            }));
    } catch (error) {
        console.error('renderProductPage error:', error);
        return next(error);
    }
};

exports.renderBrandPage = async (req, res, next) => {
    try {
        const brandSlug = String(
            req.params.brand || ''
        ).toLowerCase();
        const brandConfig = BRAND_CONFIG[brandSlug];

        if (!brandConfig) {
            return res
                .status(404)
                .send(renderNotFoundPage());
        }

        const productsRaw = await Product.find({
            active: { $ne: false },
            tag: brandConfig.slug
        })
            .sort({
                soldCount: -1,
                isRetail: 1,
                sortOrder: 1,
                createdAt: -1
            })
            .lean();

        const products = productsRaw
            .map(serializeProduct)
            .sort((left, right) => {
                return (
                    right.soldCount - left.soldCount ||
                    Number(left.isRetail) - Number(right.isRetail) ||
                    left.sortOrder - right.sortOrder ||
                    left.name.localeCompare(right.name, 'vi')
                );
            });

        return res
            .status(200)
            .type('html')
            .send(renderCategoryPageHtml({
                brandConfig,
                products
            }));
    } catch (error) {
        console.error('renderBrandPage error:', error);
        return next(error);
    }
};

exports.renderSitemap = async (req, res, next) => {
    try {
        const siteUrl = getSiteUrl();
        const products = await Product.find({
            active: { $ne: false }
        })
            .select('_id name updatedAt tag')
            .sort({ updatedAt: -1 })
            .lean();

        const today = new Date()
            .toISOString()
            .slice(0, 10);

        const urls = [
            {
                loc: `${siteUrl}/`,
                lastmod: today
            },
            ...Object.keys(BRAND_CONFIG).map(slug => ({
                loc: `${siteUrl}/thuong-hieu/${slug}`,
                lastmod: today
            })),
            ...products.map(product => ({
                loc: `${siteUrl}${productPath(product)}`,
                lastmod: product.updatedAt
                    ? new Date(product.updatedAt)
                        .toISOString()
                        .slice(0, 10)
                    : today
            }))
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(url.lastmod)}</lastmod>
  </url>`).join('\n')}
</urlset>`;

        res.set(
            'Cache-Control',
            'public, max-age=900'
        );

        return res
            .status(200)
            .type('application/xml')
            .send(xml);
    } catch (error) {
        console.error('renderSitemap error:', error);
        return next(error);
    }
};

exports.slugify = slugify;
exports.productPath = productPath;
exports.categoryPath = categoryPath;
