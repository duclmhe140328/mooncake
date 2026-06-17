const params = new URLSearchParams(window.location.search);
const orderCode = params.get('orderCode');

const loadingState = document.querySelector('#loading-state');
const checkoutContent = document.querySelector('#checkout-content');
const statusPill = document.querySelector('#payment-status');
const message = document.querySelector('#checkout-message');
const cancelButton = document.querySelector('#cancel-button');

let expiresAt = null;
let pollingTimer = null;
let countdownTimer = null;
let redirecting = false;

function formatVnd(value) {
  return `${Number(value).toLocaleString('vi-VN')} VNĐ`;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function setStatus(status) {
  statusPill.className = 'status-pill';

  if (status === 'PAID') {
    statusPill.classList.add('paid');
    statusPill.textContent = 'Đã thanh toán';
    return;
  }

  if (status === 'EXPIRED') {
    statusPill.classList.add('failed');
    statusPill.textContent = 'Đã hết hạn';
    return;
  }

  if (status === 'CANCELLED') {
    statusPill.classList.add('failed');
    statusPill.textContent = 'Đã hủy';
    return;
  }

  statusPill.classList.add('pending');
  statusPill.textContent = 'Đang chờ thanh toán';
}

function goToResult(status) {
  if (redirecting) return;
  redirecting = true;
  clearInterval(pollingTimer);
  clearInterval(countdownTimer);
  setTimeout(() => {
    window.location.replace(`/bank-payment-result.html?orderCode=${encodeURIComponent(orderCode)}&status=${encodeURIComponent(status)}`);
  }, status === 'PAID' ? 800 : 300);
}

function renderPayment(payment) {
  setStatus(payment.status);
  document.querySelector('#qr-image').src = payment.qrUrl;
  setText('#bank-name', payment.bankName);
  setText('#account-number', payment.bankAccountNumber);
  setText('#account-name', payment.bankAccountName);
  setText('#payment-amount', formatVnd(payment.amount));
  document.querySelector('#payment-amount-raw').value = String(payment.amount);
  setText('#transfer-content', payment.transferContent);
  setText('#order-code', payment.orderCode);
  expiresAt = new Date(payment.expiresAt);

  loadingState.hidden = true;
  checkoutContent.hidden = false;

  if (payment.status !== 'PENDING') goToResult(payment.status);
}

async function loadPayment({ silent = false } = {}) {
  if (!orderCode) {
    window.location.replace('/bank-payment-result.html?status=FAILED');
    return;
  }

  try {
    const response = await fetch(`/api/payments/${encodeURIComponent(orderCode)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payment = await response.json();
    if (!response.ok) throw new Error(payment.message || 'Không tìm thấy giao dịch.');
    renderPayment(payment);
  } catch (error) {
    if (!silent) {
      loadingState.textContent = error.message || 'Không tải được giao dịch.';
      statusPill.className = 'status-pill failed';
      statusPill.textContent = 'Có lỗi';
    }
  }
}

function updateCountdown() {
  if (!expiresAt) return;
  const remaining = Math.max(0, expiresAt.getTime() - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  document.querySelector('#countdown').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (remaining <= 0) loadPayment({ silent: true });
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-target]');
  if (!button) return;

  const target = document.getElementById(button.dataset.copyTarget);
  const value = target instanceof HTMLInputElement ? target.value : target.textContent;

  try {
    await navigator.clipboard.writeText(value.trim());
    const original = button.textContent;
    button.textContent = 'Đã chép';
    setTimeout(() => { button.textContent = original; }, 1200);
  } catch {
    message.textContent = 'Không thể sao chép tự động. Vui lòng sao chép thủ công.';
  }
});

cancelButton.addEventListener('click', async () => {
  cancelButton.disabled = true;
  try {
    const response = await fetch(`/api/payments/${encodeURIComponent(orderCode)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Không thể hủy giao dịch.');
    goToResult(result.status);
  } catch (error) {
    message.textContent = error.message;
    cancelButton.disabled = false;
  }
});

loadPayment();
pollingTimer = setInterval(() => loadPayment({ silent: true }), 2500);
countdownTimer = setInterval(updateCountdown, 1000);


function updateStoredCartCount() {
    try {
        const cart = JSON.parse(
            localStorage.getItem('madame_huong_cart') || '[]'
        );
        return Array.isArray(cart) ? cart.length : 0;
    } catch {
        return 0;
    }
}
