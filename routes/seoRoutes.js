const express = require('express');
const productSeoController =
    require('../controllers/productSeoController');

const router = express.Router();

router.get(
    '/sitemap.xml',
    productSeoController.renderSitemap
);

router.get(
    '/thuong-hieu/:brand',
    productSeoController.renderBrandPage
);

router.get(
    '/san-pham/:slug/:id',
    productSeoController.renderProductPage
);

module.exports = router;
