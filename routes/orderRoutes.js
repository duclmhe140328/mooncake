const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);

router.get('/vnpay_return', orderController.vnpayReturn);
router.get('/vnpay_ipn', orderController.vnpayIpn);

module.exports = router;