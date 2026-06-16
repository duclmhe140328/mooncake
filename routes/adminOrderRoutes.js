const express = require('express');
const adminOrderController =
    require('../controllers/adminOrderController');

const router = express.Router();

router.get(
    '/',
    adminOrderController.getOrders
);

router.patch(
    '/:id/status',
    adminOrderController.updateCodStatus
);

router.post(
    '/rebuild-sales',
    adminOrderController.rebuildSales
);

module.exports = router;
