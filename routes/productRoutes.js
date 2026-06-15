const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/', productController.getProducts);
router.post('/', productController.createProduct);

// Route chuẩn REST
router.put('/:id', productController.updateProduct);
router.patch('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

// Route dự phòng bằng POST cho hosting/proxy chặn PUT hoặc DELETE
router.post('/:id/update', productController.updateProduct);
router.post('/:id/delete', productController.deleteProduct);

module.exports = router;
