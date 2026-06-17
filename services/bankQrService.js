function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

function getBankConfig() {
  const bankId = requiredEnv('BANK_ID');
  const accountNumber = requiredEnv('BANK_ACCOUNT_NUMBER');
  const accountName = requiredEnv('BANK_ACCOUNT_NAME');
  const bankName = String(process.env.BANK_NAME || bankId).trim();

  if (!/^[a-zA-Z0-9]+$/.test(bankId)) {
    throw new Error('BANK_ID chỉ được chứa chữ và số. Ví dụ: MB hoặc 970422.');
  }

  if (!/^[a-zA-Z0-9]+$/.test(accountNumber)) {
    throw new Error('BANK_ACCOUNT_NUMBER chỉ được chứa chữ và số.');
  }

  return { bankId, bankName, accountNumber, accountName };
}

function createBankQrUrl({ amount, transferContent }) {
  const { bankId, accountNumber, accountName } = getBankConfig();
  const path = `${bankId}-${accountNumber}-compact2.png`;
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: transferContent,
    accountName
  });

  return `https://img.vietqr.io/image/${path}?${query.toString()}`;
}

module.exports = { getBankConfig, createBankQrUrl };
