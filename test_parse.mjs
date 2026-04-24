import { createClient } from '@supabase/supabase-js';

const ACCOUNT_HINTS = ['bca', 'bni', 'wondr', 'bri', 'brimo', 'mandiri', 'livin', 'seabank', 'jago', 'blu', 'bsi', 'btpn', 'jenius', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip', 'ovo', 'dana', 'paypal'];
const INCOME_KEYWORDS = ['masuk', 'menerima', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'kredit', 'cr ', 'top up berhasil', 'berhasil top up', 'setor tunai', 'penerimaan', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'transfer keluar', 'debit', 'db ', 'dr ', 'transaksi berhasil', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya', 'biaya admin', 'biaya layanan', 'fee'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'pengiriman'];
const TRANSFER_OUT_KEYWORDS = ['telah dikirim', 'dikirim ke', 'dikirim', 'mengirim', 'kirim ke', 'transfer ke', 'pindah ke', 'ditransfer ke', 'pembayaran'];
const TRANSFER_IN_KEYWORDS = ['diterima', 'menerima', 'transfer masuk', 'dana masuk', 'masuk dari', 'ditransfer dari'];
const STRONG_INCOME_KEYWORDS = ['masuk', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'penerimaan', 'pemasukan', 'setor tunai'];
const STRONG_EXPENSE_KEYWORDS = ['bayar', 'membayar', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya admin', 'biaya layanan'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'ipo', 'ajaib', 'rhb', 'philip', 'sinarmas sekuritas', 'ciptadana'];
const E_WALLET_APPS = ['dana', 'gopay', 'ovo', 'shopeepay', 'flip'];

const normalizeText = (value) => value.toLowerCase().trim();
const containsAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword));
const detectFeeCharge = (text) => text.includes('dikenakan biaya') || text.includes('biaya admin') || text.includes('biaya layanan') || text.includes('fee') || text.includes('admin');
const extractAmount = (text) => {
    const candidates = [
        text.match(/rp\s*([\d.,]+)/i),
        text.match(/\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\b/),
        text.match(/\b(\d{5,})\b/)
    ];

    for (const match of candidates) {
        const raw = match?.[1];
        if (!raw) continue;
        const normalized = raw.replace(/[,.]\d{1,2}$/, '').replace(/[.,]/g, '');
        const amount = Number(normalized);
        if (Number.isFinite(amount) && amount > 0) return amount;
    }
    return null;
};

const detectTransferLikeTopUp = (sourceApp, text) => {
    const lowerSourceApp = normalizeText(sourceApp);
    if (text.includes('dikenakan biaya') || text.includes('biaya admin') || text.includes('biaya layanan')) return false;
    const mentionsTopUp = text.includes('top up') || text.includes('topup') || text.includes('pengisian saldo') || text.includes('isi saldo');
    const isEwalletTransfer = E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
        && (text.includes('dikirim ke') || text.includes('telah dikirim'));
    if (isEwalletTransfer) return true;
    const isBankTopUpEwallet = mentionsTopUp && E_WALLET_APPS.some((app) => text.includes(app));
    if (isBankTopUpEwallet) return true;
    if (!mentionsTopUp) return false;
    return E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
        || text.includes('saldo')
        || text.includes('dari ');
};

function parse(sourceApp, title, text) {
    const combined = `${title} ${text}`.trim();
    const lowerText = normalizeText(combined);
    const amount = extractAmount(combined);
    
    let type = null;
    let confidenceScore = 0.2;

    if (detectFeeCharge(lowerText)) {
        type = 'EXPENSE';
        confidenceScore = 0.9;
    } else if (detectTransferLikeTopUp(sourceApp, lowerText)) {
        type = 'TRANSFER';
        confidenceScore = 0.78;
    } else {
        const incomeStrongHit = containsAny(lowerText, STRONG_INCOME_KEYWORDS);
        const expenseStrongHit = detectFeeCharge(lowerText) || containsAny(lowerText, STRONG_EXPENSE_KEYWORDS);
        const incomeAnyHit = containsAny(lowerText, INCOME_KEYWORDS);
        const expenseAnyHit = containsAny(lowerText, EXPENSE_KEYWORDS);

        if (incomeStrongHit && !expenseStrongHit) {
            type = 'INCOME';
            confidenceScore = 0.84;
        } else if (expenseStrongHit && !incomeStrongHit) {
            type = 'EXPENSE';
            confidenceScore = lowerText.includes('dikenakan biaya') ? 0.88 : 0.8;
        } else if (incomeStrongHit && expenseStrongHit) {
            type = 'EXPENSE';
            confidenceScore = 0.72;
        } else if (incomeAnyHit && !expenseAnyHit) {
            type = 'INCOME';
            confidenceScore = 0.78;
        } else if (expenseAnyHit && !incomeAnyHit) {
            type = 'EXPENSE';
            confidenceScore = 0.78;
        } else if (normalizeText(sourceApp).includes('flip') || containsAny(lowerText, TRANSFER_KEYWORDS)) {
            type = 'TRANSFER';
            confidenceScore = 0.75;
        }
    }
    return { type, confidenceScore, amount };
}

console.log(parse('DANA', '', 'Rp20.000 telah dikirim ke BASHOR FAUZAN MUTHOH - ****1533 💸'));
