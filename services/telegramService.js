const axios = require('axios');

exports.sendOrderNotification = async (order) => {
    const orderCode = order.orderCode || order?._id?.slice(-6).toUpperCase();

    const productsText = order.products
        .map((p) => {
            const price = Number(p.price || 0).toLocaleString('vi-VN');
            return `- ${p.name} (SL: ${p.quantity}) - ${price} VNĐ`;
        })
        .join('\n');

    const message = `
🛎 <b>CÓ ĐƠN HÀNG MỚI!</b>
Mã order: <b>${orderCode}</b>
👤 Khách hàng: ${order.customerName}
📞 SĐT: ${order.phone}
📍 Địa chỉ: ${order.address}
🛍 Sản phẩm:
${productsText}
💰 Tổng tiền: ${Number(order.totalAmount).toLocaleString('vi-VN')} VNĐ
💳 Phương thức: ${order.paymentMethod}
Trạng thái: ${order.orderStatus || order.paymentStatus || 'NEW'}
    `;

    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Lỗi gửi Telegram:', error.response?.data || error.message);
    }
};