const express = require('express');
const reviewController =
    require('../controllers/reviewController');

const router = express.Router();

router.get(
    '/product/:productId',
    reviewController.getProductReviews
);

router.post(
    '/',
    reviewController.createReview
);

module.exports = router;
