const params = new URLSearchParams(window.location.search);
const orderCode = params.get('orderCode');
const forcedStatus = params.get('status');

const card = document.querySelector('#result-card');
const icon = document.querySelector('#result-icon');
const title = document.querySelector('#result-title');
const description = document.querySelector('#result-description');
const details = document.querySelector('#result-details');

function clearCartAfterSuccessfulPayment() {
    localStorage.removeItem('madame_huong_cart');
}

function showStatus(status) {
    card.classList.remove('success', 'failed', 'pending');

    if (status === 'PAID') {
        card.classList.add('success');
        icon.textContent = '✓';
        title.textContent = 'Thanh toán thành công';
        description.textContent = 'Tiền đã được ghi nhận. Đơn hàng đang được xác nhận và chuẩn bị.';
        clearCartAfterSuccessfulPayment();
        return;
    }

    if (status === 'PENDING') {
        card.classList.add('pending');
        icon.textContent = '…';
        title.textContent = 'Đang chờ thanh toán';
        description.textContent = 'Hệ thống chưa nhận được giao dịch phù hợp từ ngân hàng.';
        return;
    }

    if (status === 'EXPIRED') {
        card.classList.add('failed');
        icon.textContent = '×';
        title.textContent = 'Giao dịch đã hết hạn';
        description.textContent = 'Chưa ghi nhận thanh toán trong thời gian cho phép. Giỏ hàng của bạn vẫn được giữ lại.';
        return;
    }

    if (status === 'CANCELLED') {
        card.classList.add('failed');
        icon.textContent = '×';
        title.textContent = 'Giao dịch đã hủy';
        description.textContent = 'Giao dịch chưa được thanh toán. Giỏ hàng của bạn vẫn được giữ lại.';
        return;
    }

    card.classList.add('failed');
    icon.textContent = '×';
    title.textContent = 'Không thể xác nhận giao dịch';
    description.textContent = 'Vui lòng kiểm tra lại hoặc liên hệ CSKH.';
}

async function loadPayment() {
    if (!orderCode) {
        showStatus(forcedStatus || 'FAILED');
        return;
    }

    try {
        const response = await fetch(
            `/api/payments/${encodeURIComponent(orderCode)}`,
            { cache: 'no-store' }
        );
        const payment = await response.json();

        if (!response.ok) {
            throw new Error(
                payment.message ||
                'Không tìm thấy giao dịch.'
            );
        }

        showStatus(payment.status);
        document.querySelector('#detail-order').textContent = payment.orderCode;
        document.querySelector('#detail-name').textContent = payment.customerName;
        document.querySelector('#detail-description').textContent = payment.description;
        document.querySelector('#detail-amount').textContent = `${Number(payment.amount).toLocaleString('vi-VN')} VNĐ`;
        details.hidden = false;
    } catch (error) {
        showStatus('FAILED');
        description.textContent = error.message;
    }
}

loadPayment();
