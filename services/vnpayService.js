const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');

function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();

    keys.forEach((key) => {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    });

    return sorted;
}

function normalizeIp(ipAddr) {
    if (!ipAddr) return '127.0.0.1';

    let ip = String(ipAddr).split(',')[0].trim();

    if (ip === '::1') return '127.0.0.1';

    if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }

    return ip;
}

exports.createPaymentUrl = (paymentData, ipAddr) => {
    const tmnCode = String(process.env.VNP_TMN_CODE || '').trim();
    const secretKey = String(process.env.VNP_HASH_SECRET || '').trim();
    const returnUrl = String(process.env.VNP_RETURN_URL || '').trim();
    const vnpUrl = String(process.env.VNP_URL || '').trim();

    if (!tmnCode || !secretKey || !returnUrl || !vnpUrl) {
        throw new Error('Thiếu cấu hình VNPAY trong file .env');
    }

    if (!vnpUrl.includes('sandbox.vnpayment.vn')) {
        throw new Error('Đang test thì VNP_URL phải là sandbox.vnpayment.vn');
    }

    const now = moment().utcOffset('+0700');
    const createDate = now.format('YYYYMMDDHHmmss');

    // Để 30 phút cho đỡ bị hết hạn nhanh khi test
    const expireDate = now.clone().add(30, 'minutes').format('YYYYMMDDHHmmss');

    const txnRef = String(paymentData.txnRef || '').trim();
    const amount = Math.round(Number(paymentData.totalAmount));

    if (!txnRef) {
        throw new Error('Thiếu txnRef cho giao dịch VNPAY');
    }

    if (!amount || amount <= 0) {
        throw new Error('Số tiền thanh toán không hợp lệ');
    }

    let vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: tmnCode,
        vnp_Amount: amount * 100,
        vnp_CurrCode: 'VND',
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: `Thanh toan don hang ${txnRef}`,
        vnp_OrderType: 'other',
        vnp_Locale: 'vn',
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: normalizeIp(ipAddr),
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate
    };

    vnpParams = sortObject(vnpParams);

    const signData = qs.stringify(vnpParams, { encode: false });

    const secureHash = crypto
        .createHmac('sha512', secretKey)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');

    vnpParams.vnp_SecureHash = secureHash;

    const paymentUrl = `${vnpUrl}?${qs.stringify(vnpParams, { encode: false })}`;

    console.log('====== VNPAY DEBUG ======');
    console.log('VNP_TXN_REF:', txnRef);
    console.log('VNP_CREATE_DATE:', createDate);
    console.log('VNP_EXPIRE_DATE:', expireDate);
    console.log('VNP_RETURN_URL:', returnUrl);
    console.log('VNP_PAYMENT_URL:', paymentUrl);
    console.log('=========================');

    return paymentUrl;
};