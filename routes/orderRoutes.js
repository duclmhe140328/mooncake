const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');

/*
|--------------------------------------------------------------------------
| VNPAY ROUTES
|--------------------------------------------------------------------------
| Đặt các route cố định lên đầu để tránh xung đột với route động sau này.
*/

router.get('/vnpay_return', (req, res, next) => {
    console.log('Đã nhận VNPay Return:', req.query);

    return orderController.vnpayReturn(req, res, next);
});

router.get('/vnpay_ipn', (req, res, next) => {
    console.log('Đã nhận VNPay IPN:', req.query);

    return orderController.vnpayIpn(req, res, next);
});

/*
|--------------------------------------------------------------------------
| ORDER ROUTES
|--------------------------------------------------------------------------
*/

router.post('/', orderController.createOrder);

router.get('/', orderController.getOrders);

module.exports = router;
