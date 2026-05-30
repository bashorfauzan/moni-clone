import express from 'express';
import { TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { syncAccountBalances } from '../lib/accountBalances.js';
import { isDualAccountTransactionType, isSourceOnlyTransactionType } from '../lib/transactionRules.js';

const router = express.Router();
// Removed hacky notificationInboxClient definition

type ParseStatus = 'PENDING' | 'PARSED' | 'IGNORED' | 'FAILED';

type ParsedNotification = {
    amount: number | null;
    type: TransactionType | null;
    description: string;
    accountHint: string | null;
    sourceAccountHint: string | null;
    destinationAccountHint: string | null;
    confidenceScore: number;
    parseStatus: ParseStatus;
    parseNotes: string | null;
};

export const shouldCreateTransactionFromNotification = (parsed: ParsedNotification) =>
    Boolean(parsed.amount && parsed.type && parsed.parseStatus !== 'IGNORED' && parsed.parseStatus !== 'FAILED');

export const shouldAutoValidateNotificationTransaction = (parsed: ParsedNotification) =>
    parsed.parseStatus === 'PARSED';

const ACCOUNT_HINTS = ['bca', 'bsya', 'bni', 'wondr', 'bri', 'brimo', 'mandiri', 'livin', 'seabank', 'jago', 'blu', 'bsi', 'btpn', 'jenius', 'rhb', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip', 'ovo', 'dana', 'paypal'];
const INCOME_KEYWORDS = ['masuk', 'menerima', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'kredit', 'cr ', 'setor tunai', 'penerimaan', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'transfer keluar', 'debit', 'db ', 'dr ', 'transaksi berhasil', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya', 'biaya admin', 'biaya layanan', 'fee'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'pengiriman'];
const TRANSFER_OUT_KEYWORDS = ['dikirim', 'mengirim', 'kirim ke', 'transfer ke', 'transfer dana ke rekening', 'pindah ke', 'ditransfer ke', 'pembayaran'];
const TRANSFER_IN_KEYWORDS = ['diterima', 'menerima', 'transfer masuk', 'dana masuk', 'masuk dari', 'ditransfer dari'];
// Keywords yang sangat kuat mengindikasikan INCOME (prioritas tinggi vs EXPENSE ambiguous)
const STRONG_INCOME_KEYWORDS = ['masuk', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'penerimaan', 'pemasukan', 'setor tunai'];
const STRONG_EXPENSE_KEYWORDS = ['bayar', 'membayar', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya admin', 'biaya layanan'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'ipo', 'ajaib', 'rhb', 'philip', 'sinarmas sekuritas', 'ciptadana'];
const E_WALLET_APPS = ['dana', 'gopay', 'ovo', 'shopeepay', 'flip'];
const TOP_UP_RECONCILIATION_WINDOW_MS = 15 * 60 * 1000;
const TOP_UP_RECONCILIATION_MAX_FEE = 5000;
const DUPLICATE_NOTIFICATION_WINDOW_MS = 5 * 60 * 1000;
const CHAT_APP_HINTS = ['whatsapp', 'wa business', 'telegram', 'line', 'discord', 'messenger', 'instagram', 'facebook', 'signal'];
const EMAIL_PACKAGE_HINTS = ['com.google.android.gm', 'com.microsoft.office.outlook'];
const PROMO_KEYWORDS = [
    'promo', 'promosi', 'diskon', 'voucher', 'cashback spesial', 'cashback hingga',
    'kesempatan terbatas', 'penawaran', 'pakai', 'pertama kali', 'khusus hari ini',
    'berlaku sampai', 's.d.', 'sd.', 'hemat', 'bonus', 'kupon', 'kode promo',
    'simpan kartu bankmu', 'lebih mudah', 'coba yuk', 'spesial buatmu', 'cek info'
];
const SECURITY_ALERT_KEYWORDS = [
    'login gagal', 'masuk gagal', 'gagal masuk', 'percobaan login', 'percobaan masuk',
    'aktivitas mencurigakan', 'suspicious activity', 'failed login', 'login failed',
    'akses tidak dikenal', 'perangkat baru', 'new device', 'unauthorized', 'unauthorized access',
    'verifikasi keamanan', 'otp salah', 'pin salah', 'password salah', 'kata sandi salah',
    'akun diblokir', 'akun dikunci', 'too many attempts', 'terlalu banyak percobaan',
    'login dari perangkat', 'login dari lokasi', 'masuk dari perangkat'
];

const detectSecurityAlert = (text: string): boolean => {
    const lower = normalizeText(text);
    return SECURITY_ALERT_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const normalizeText = (value: string) => value.toLowerCase().trim();

const containsAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

const containsIncomeSignal = (text: string) => {
    const lower = normalizeText(text);

    if (containsAny(lower, INCOME_KEYWORDS.filter((keyword) => keyword !== 'kredit'))) {
        return true;
    }

    if (/\bkredit\b/.test(lower) && !lower.includes('kartu kredit')) {
        return true;
    }

    return false;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const ACCOUNT_HINT_ALIASES: Record<string, string> = {
    brimo: 'bri',
    mybca: 'bca',
    livin: 'mandiri',
    wondr: 'bni',
    bsya: 'bsya'
};

const canonicalizeAccountHint = (hint?: string | null) => {
    if (!hint) return null;
    const normalized = normalizeText(hint);
    return ACCOUNT_HINT_ALIASES[normalized] ?? normalized;
};

const extractAmount = (text: string) => {
    const contextualPatterns = [
        /(?:total transaksi|jumlah transaksi|nominal transaksi|nilai transaksi)\s*:?\s*(?:rp\.?\s*)?([\d.,]+)/i,
        /(?:total|jumlah|nominal)\s*:?\s*(?:rp\.?\s*)?([\d.,]+)/i,
        /(?:sebesar|senilai)\s*(?:rp\.?\s*)?([\d.,]+)/i
    ];

    for (const pattern of contextualPatterns) {
        const raw = text.match(pattern)?.[1];
        if (!raw) continue;

        const normalized = raw.replace(/[,.]\d{1,2}$/, '').replace(/[.,]/g, '');
        const amount = Number(normalized);
        if (Number.isFinite(amount) && amount > 0) {
            return amount;
        }
    }

    // Handle Indonesian format: Rp2.700.000,00 OR Rp 2.700.000
    const candidates = [
        text.match(/rp\s*([\d.,]+)/i),
        text.match(/\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\b/),
        text.match(/\b(\d{5,})\b/)
    ];

    for (const match of candidates) {
        const raw = match?.[1];
        if (!raw) continue;

        // Angka panjang tanpa separator biasanya nomor referensi / QRIS, bukan nominal transaksi.
        if (!/[.,]/.test(raw) && raw.length >= 10) continue;

        // Remove trailing decimal like ,00
        const normalized = raw.replace(/[,.]\d{1,2}$/, '').replace(/[.,]/g, '');
        const amount = Number(normalized);
        if (Number.isFinite(amount) && amount > 0) {
            return amount;
        }
    }

    return null;
};

const detectAccountHint = (text: string) => {
    const lower = normalizeText(text);
    return ACCOUNT_HINTS.find((hint) => new RegExp(`(^|[^a-z0-9])${escapeRegex(hint)}([^a-z0-9]|$)`, 'i').test(lower)) ?? null;
};

const detectAccountNumberHint = (text: string) => {
    const accountAnchors = [
        /rekening\s+([*\dxX-]{4,})/i,
        /rek(?:ening)?\s+([*\dxX-]{4,})/i,
        /tujuan\s+([*\dxX-]{4,})/i,
        /-\s*([*\d]{4,})\b/i
    ];

    for (const pattern of accountAnchors) {
        const raw = text.match(pattern)?.[1];
        const digits = raw ? digitsOnly(raw) : '';
        if (digits.length >= 4) return digits;
    }

    const standalone = text.match(/\b\d{10,18}\b/g) ?? [];
    const candidate = standalone
        .map((item) => digitsOnly(item))
        .sort((a, b) => b.length - a.length)[0];

    return candidate && candidate.length >= 10 ? candidate : null;
};

const isDirectionlessSuccessNotification = (text: string) => {
    const genericSuccess = text.includes('transaksi berhasil')
        || text.includes('kamu baru aja transaksi sebesar');
    const hasDirectionProof = containsAny(text, [
        'masuk ke rekening',
        'telah dikirim ke',
        'transfer ke',
        'transfer dari',
        'diterima dari',
        'debit',
        'kredit',
        'top up',
        'pengisian saldo',
        'setor tunai',
        'tarik tunai'
    ]);

    return genericSuccess && !hasDirectionProof;
};

const detectTransferLikeTopUp = (sourceApp: string, text: string) => {
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

const isBniFamilySource = (sourceApp: string) => {
    const normalized = normalizeText(sourceApp);
    return normalized.includes('bni') || normalized.includes('wondr');
};

const detectBniIncomingNotification = (sourceApp: string, text: string) => {
    if (!isBniFamilySource(sourceApp)) return false;

    return containsAny(text, [
        'transaksi diterima',
        'kamu baru aja terima rp',
        'kamu baru aja menerima rp'
    ]);
};

const detectBniOutgoingNotification = (sourceApp: string, text: string) => {
    if (!isBniFamilySource(sourceApp)) return false;

    return containsAny(text, [
        'transaksi berhasil',
        'kamu baru aja transaksi sebesar rp',
        'kamu baru aja bayar rp',
        'kamu baru aja membayar rp'
    ]);
};

const detectTransferOutConfirmation = (sourceApp: string, text: string) => {
    if (containsAny(text, [
        'nomor rekening tujuan',
        'rekening tujuan',
        'penerima',
        'tujuan transfer',
        'sumber dana'
    ])) {
        return true;
    }

    return isBniFamilySource(sourceApp) && containsAny(text, [
        'transfer berhasil',
        'kamu baru aja transaksi sebesar',
        'telah dikirim ke',
        'dikirim ke'
    ]);
};

const detectQrisExpenseNotification = (sourceApp: string, title: string, text: string) => {
    const combined = normalizeText(`${title} ${text}`.trim());
    const source = normalizeText(sourceApp);

    const isQris = combined.includes('qris');
    const isSuccess = combined.includes('sukses') || combined.includes('berhasil');
    const hasAmount = /\brp\s*[\d.,]+/i.test(`${title} ${text}`);
    const hasMerchantPattern = combined.includes('sebesar rp') || combined.includes('merchant') || combined.includes('trx qris');
    const isBankingSource = containsAny(source, ['bsya', 'bca', 'bri', 'bni', 'mandiri', 'livin', 'wondr', 'bsi']);

    return isBankingSource && isQris && isSuccess && hasAmount && hasMerchantPattern;
};

const extractQrisMerchantName = (title: string, text: string) => {
    const combined = `${title} ${text}`.replace(/\s+/g, ' ').trim();
    const merchantMatch = combined.match(/(?:sukses|berhasil)\s*-\s*(.+?)\s+sebesar\s+rp\.?\s*[\d.,]+/i);
    if (!merchantMatch?.[1]) return null;

    return merchantMatch[1]
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
};

const titleCaseWords = (value: string) => value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const formatLabelName = (value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return normalized;
    if (/^[A-Z0-9\s&.-]+$/.test(normalized)) return normalized;
    return titleCaseWords(normalized);
};

const extractTopUpTargetName = (title: string, text: string) => {
    const combined = `${title} ${text}`.replace(/\s+/g, ' ').trim();
    const targetMatch = combined.match(/(?:top up|topup|pengisian saldo|isi saldo)\s+([A-Za-z0-9 .&-]{2,40}?)(?:\s+dari|\s+berhasil|\s+sebesar|\s+rp\b|\bke\b|$)/i);
    if (!targetMatch?.[1]) return null;
    return formatLabelName(targetMatch[1]).slice(0, 60);
};

const extractTransferOutTargetName = (title: string, text: string) => {
    const combined = `${title} ${text}`.replace(/\s+/g, ' ').trim();
    const targetMatch = combined.match(/(?:telah dikirim ke|dikirim ke|transfer ke|ke rekening|ke)\s+([A-Za-z0-9 .&-]{2,60}?)(?:\s+sebesar|\s+rp\b|\s+nomor referensi|\s+ref[:.]|\s+dari|\s+$|,)/i);
    if (!targetMatch?.[1]) return null;
    return formatLabelName(targetMatch[1]).slice(0, 80);
};

const extractTransferInSourceName = (title: string, text: string) => {
    const combined = `${title} ${text}`.replace(/\s+/g, ' ').trim();
    const sourceMatch = combined.match(/(?:diterima dari|transfer dari|masuk dari|dari)\s+([A-Za-z0-9 .&-]{2,60}?)(?:\s+sebesar|\s+rp\b|\s+ke rekening|\s+nomor referensi|\s+ref[:.]|\s+$|,)/i);
    if (!sourceMatch?.[1]) return null;
    return formatLabelName(sourceMatch[1]).slice(0, 80);
};

const buildParsedDescription = (sourceApp: string, title: string, text: string, type: TransactionType | null) => {
    if (type === TransactionType.EXPENSE && detectQrisExpenseNotification(sourceApp, title, text)) {
        const merchant = extractQrisMerchantName(title, text);
        if (merchant) return `QRIS - ${merchant}`;
        return 'QRIS';
    }

    const lowerCombined = normalizeText(`${title} ${text}`.trim());

    if (type === TransactionType.TRANSFER && detectTransferLikeTopUp(sourceApp, lowerCombined)) {
        const target = extractTopUpTargetName(title, text);
        if (target) return `Top Up - ${target}`;
        return 'Top Up';
    }

    if (type === TransactionType.TRANSFER || type === TransactionType.EXPENSE) {
        const target = extractTransferOutTargetName(title, text);
        if (target) return `Transfer ke ${target}`;
    }

    if (type === TransactionType.INCOME) {
        const source = extractTransferInSourceName(title, text);
        if (source) return `Transfer masuk dari ${source}`;
    }

    return text.trim().slice(0, 160);
};

const normalizeTypeForDuplicate = (type: TransactionType | null | undefined) => {
    if (type === TransactionType.INVESTMENT_OUT) return TransactionType.EXPENSE;
    if (type === TransactionType.INVESTMENT_IN) return TransactionType.TRANSFER;
    return type ?? null;
};

const getDuplicateSourceKey = (sourceApp: string) => {
    const sourceHint = detectSourceAppHint(sourceApp);
    if (sourceHint) return sourceHint;

    return normalizeText(sourceApp).replace(/[^a-z0-9]+/g, ' ').trim();
};

const buildDuplicateFingerprint = (title: string, senderName: string, text: string) => {
    return normalizeText(`${title} ${senderName} ${text}`)
        .replace(/\brp\s*[\d.,]+\b/g, ' ')
        .replace(/\b\d{1,2}[:/-]\d{1,2}(?::\d{2})?\b/g, ' ')
        .replace(/\b\d{2,18}\b/g, ' ')
        .replace(/\b(notif|auto|kamu|baru|aja|transaksi|sebesar|berhasil|klik|untuk|cek|detailnya|info|lebih|lanjut|hubungi|hubun)\b/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const getFingerprintTokens = (value: string) => {
    return new Set(
        value
            .split(' ')
            .map((token) => token.trim())
            .filter((token) => token.length >= 4)
    );
};

const hasMeaningfulTokenOverlap = (left: string, right: string) => {
    if (!left || !right) return false;

    const leftTokens = getFingerprintTokens(left);
    const rightTokens = getFingerprintTokens(right);
    let overlap = 0;

    for (const token of leftTokens) {
        if (rightTokens.has(token)) {
            overlap += 1;
            if (overlap >= 2) return true;
        }
    }

    return false;
};

const isGenericIncomingDuplicateTemplate = (sourceApp: string, text: string) => {
    return detectBniIncomingNotification(sourceApp, text)
        || containsAny(text, [
            'kamu baru aja terima rp',
            'kamu baru aja menerima rp',
            'transaksi diterima'
        ]);
};

const isGenericOutgoingDuplicateTemplate = (sourceApp: string, text: string) => {
    return detectBniOutgoingNotification(sourceApp, text)
        || containsAny(text, [
            'kamu baru aja transaksi sebesar rp',
            'kamu baru aja bayar rp',
            'kamu baru aja membayar rp'
        ]);
};

const hasSpecificTransactionContext = (text: string) => {
    return containsAny(text, [
        'top up',
        'topup',
        'pengisian saldo',
        'isi saldo',
        'rekening tujuan',
        'nomor rekening',
        'nomor referensi',
        'no. referensi',
        'ref:',
        'diterima dari',
        'transfer ke',
        'transfer dari',
        'dikirim ke',
        'ke rekening',
        'shopeepay',
        'gopay',
        'dana',
        'ovo',
        'flip',
        'rdn'
    ]);
};

const isLikelyDuplicateNotificationPair = ({
    sourceApp,
    title,
    senderName,
    text,
    parsedType,
    existing
}: {
    sourceApp: string;
    title: string;
    senderName: string;
    text: string;
    parsedType: TransactionType | null;
    existing: {
        sourceApp: string;
        title: string | null;
        senderName: string | null;
        messageText: string;
        parsedType: TransactionType | null;
    };
}) => {
    const currentType = normalizeTypeForDuplicate(parsedType);
    const existingType = normalizeTypeForDuplicate(existing.parsedType);
    if (!currentType || currentType !== existingType) return false;

    const currentSourceKey = getDuplicateSourceKey(sourceApp);
    const existingSourceKey = getDuplicateSourceKey(existing.sourceApp);
    if (!currentSourceKey || currentSourceKey !== existingSourceKey) return false;

    const currentCombined = normalizeText(`${title} ${senderName} ${text}`.trim());
    const existingCombined = normalizeText(`${existing.title || ''} ${existing.senderName || ''} ${existing.messageText}`.trim());

    if (currentCombined === existingCombined) return true;

    const currentFingerprint = buildDuplicateFingerprint(title, senderName, text);
    const existingFingerprint = buildDuplicateFingerprint(existing.title || '', existing.senderName || '', existing.messageText);
    if (currentFingerprint && currentFingerprint === existingFingerprint) return true;
    if (hasMeaningfulTokenOverlap(currentFingerprint, existingFingerprint)) return true;

    const currentGeneric = currentType === TransactionType.INCOME
        ? isGenericIncomingDuplicateTemplate(sourceApp, currentCombined)
        : currentType === TransactionType.EXPENSE
            ? isGenericOutgoingDuplicateTemplate(sourceApp, currentCombined)
            : false;
    const existingGeneric = existingType === TransactionType.INCOME
        ? isGenericIncomingDuplicateTemplate(existing.sourceApp, existingCombined)
        : existingType === TransactionType.EXPENSE
            ? isGenericOutgoingDuplicateTemplate(existing.sourceApp, existingCombined)
            : false;

    return currentGeneric !== existingGeneric
        && (currentGeneric || existingGeneric)
        && (hasSpecificTransactionContext(currentCombined) || hasSpecificTransactionContext(existingCombined));
};

const detectFeeCharge = (text: string) => {
    return text.includes('dikenakan biaya')
        || text.includes('biaya admin')
        || text.includes('biaya layanan')
        || text.includes('fee')
        || text.includes('admin');
};

const detectFailedOrCancelledNotification = (text: string) => {
    return containsAny(text, [
        'dibatalkan',
        'dibatalkan.',
        'transaksi dibatalkan',
        'top up dibatalkan',
        'gagal',
        'tidak berhasil',
        'belum berhasil',
        'expired',
        'kedaluwarsa',
        'dibatalkan otomatis'
    ]);
};

const detectConfirmedSuccessNotification = (text: string) => {
    return containsAny(text, [
        'sukses',
        'berhasil',
        'transaksi berhasil',
        'transfer berhasil',
        'top up berhasil',
        'berhasil ditransfer',
        'telah dikirim',
        'dikirim ke',
        'diterima',
        'masuk ke rekening',
        'kredit',
        'debit'
    ]);
};

const shouldIgnoreRdnFinancialNote = (sourceApp: string, title: string, text: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    const lowerTitle = normalizeText(title);
    const lowerText = normalizeText(text);

    const isBcaFamily = lowerSourceApp.includes('bca') || lowerSourceApp.includes('mybca');
    const isFinancialNote = lowerTitle.includes('catatan finansial') || lowerText.includes('catatan finansial');

    return isBcaFamily && isFinancialNote && lowerText.includes('rdn');
};

const shouldIgnorePromotionalNotification = (sourceApp: string, title: string, text: string) => {
    const combined = normalizeText(`${title} ${text}`.trim());

    const hasPromoKeyword = PROMO_KEYWORDS.some((keyword) => combined.includes(keyword));
    const hasCreditCardMarketingHint = containsAny(combined, [
        'kartu kredit',
        'dapatkan limit',
        'limit hingga',
        'limit sampai',
        'ajukan kartu',
        'approval cuma',
        'approval hanya',
        'myads.id',
        '2 messages'
    ]);
    if (!hasPromoKeyword && !hasCreditCardMarketingHint) return false;

    const hasStrongTransactionalProof = [
        'transaksi berhasil', 'transfer berhasil', 'top up berhasil',
        'transaksi berhasil', 'berhasil ditransfer', 'telah dikirim', 'dikirim ke',
        'diterima dari', 'nomor referensi', 'no. referensi', 'ref:', 'sisa saldo',
        'saldo akhir', 'mutasi', 'debit', 'kredit', 'va ', 'briva'
    ].some((keyword) => combined.includes(keyword));

    if (hasCreditCardMarketingHint) return true;
    if (hasStrongTransactionalProof) return false;

    if (combined.includes('tarik tunai') && (combined.includes('diskon') || combined.includes('promo'))) {
        return true;
    }

    return true;
};

const hasExplicitMoneyMarker = (text: string) => {
    return /\brp\s?[\d.,]+/i.test(text)
        || /\bidr\s?[\d.,]+/i.test(text)
        || /(?:saldo|rekening|account|nominal|total|jumlah|debit|kredit|transfer|transaksi|mutasi|tagihan|top up|topup|bayar|pembayaran)/i.test(text);
};

const isChatAppSource = (sourceApp: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    return CHAT_APP_HINTS.some((hint) => lowerSourceApp.includes(hint));
};

const isWhatsAppSource = (sourceApp: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    return lowerSourceApp.includes('whatsapp') || lowerSourceApp.includes('wa business');
};

const shouldIgnoreLikelyChatMessage = (sourceApp: string, title: string, text: string) => {
    if (isWhatsAppSource(sourceApp)) return true;
    if (!isChatAppSource(sourceApp)) return false;

    const combined = `${title} ${text}`.trim();

    if (hasExplicitMoneyMarker(combined)) return false;
    if (detectAccountHint(combined)) return false;
    if (detectSecurityAlert(combined)) return false;

    return true;
};

const isEmailPackage = (packageName: string) => {
    const normalized = normalizeText(packageName || '');
    return EMAIL_PACKAGE_HINTS.includes(normalized);
};

const shouldProcessEmailNotification = (sourceApp: string, senderName: string, title: string, text: string) => {
    const combined = normalizeText(`${sourceApp} ${senderName} ${title} ${text}`.trim());

    if (detectSecurityAlert(combined)) return true;
    if (detectAccountHint(combined)) return true;
    if (hasExplicitMoneyMarker(combined)) return true;

    return [
        'rekening',
        'saldo',
        'mutasi',
        'transaksi',
        'berhasil',
        'transfer',
        'debit',
        'kredit',
        'briva',
        'virtual account',
        'va ',
        'notification',
        'notifikasi'
    ].some((keyword) => combined.includes(keyword));
};

const detectSourceAppHint = (sourceApp: string) => {
    return canonicalizeAccountHint(detectAccountHint(sourceApp));
};

const isEWalletHint = (hint?: string | null) => {
    if (!hint) return false;
    return E_WALLET_APPS.includes(canonicalizeAccountHint(hint) ?? '');
};

const detectHintAfterAnchors = (text: string, anchors: string[]) => {
    for (const anchor of anchors) {
        const index = text.indexOf(anchor);
        if (index < 0) continue;

        const window = text.slice(index + anchor.length, index + anchor.length + 48);
        const hint = detectAccountHint(window);
        if (hint) return hint;
    }

    return null;
};

const detectTransferDirection = (text: string) => {
    if (
        text.includes('rekening tujuan')
        || text.includes('nomor rekening tujuan')
        || text.includes('tujuan transfer')
        || text.includes('penerima')
        || text.includes('sumber dana')
    ) return 'OUT';
    if (containsAny(text, TRANSFER_OUT_KEYWORDS)) return 'OUT';
    if (containsAny(text, TRANSFER_IN_KEYWORDS)) return 'IN';
    return 'UNKNOWN';
};

const needsDestinationReview = (text: string) => {
    return containsAny(text, [
        'sesama bca',
        'sesama bca syariah',
        'ke rekening sesama',
        'antar rekening',
        'transfer dana ke rekening sesama',
        'grup bca'
    ]);
};

const resolveAccountHints = (
    type: TransactionType | null,
    sourceApp: string,
    text: string,
    fallbackHint: string | null
) => {
    const sourceAppHint = detectSourceAppHint(sourceApp);
    const hintFromSourcePhrase = detectHintAfterAnchors(text, ['dari ', 'via ', 'dr ', 'sumber dana ']);
    const hintFromDestinationPhrase = detectHintAfterAnchors(text, ['ke rekening ', 'ke ', 'tujuan ']);
    const accountNumberHint = detectAccountNumberHint(text);
    const transferDirection = detectTransferDirection(text);
    const isTopUpLike = detectTransferLikeTopUp(sourceApp, text);

    let sourceAccountHint: string | null = null;
    let destinationAccountHint: string | null = null;
    const isEWalletTopUp = type && isDualAccountTransactionType(type)
        ? isTopUpLike && isEWalletHint(sourceAppHint)
        : false;

    if (type && isDualAccountTransactionType(type)) {
        if (isEWalletTopUp) {
            if (transferDirection === 'OUT') {
                sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
                destinationAccountHint = accountNumberHint
                    ?? hintFromDestinationPhrase
                    ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
            } else {
                sourceAccountHint = hintFromSourcePhrase
                    ?? accountNumberHint
                    ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
                destinationAccountHint = sourceAppHint
                    ?? hintFromDestinationPhrase
                    ?? fallbackHint;
            }
        } else if (transferDirection === 'OUT') {
            sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
        } else if (transferDirection === 'IN') {
            sourceAccountHint = hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? sourceAppHint ?? fallbackHint ?? hintFromDestinationPhrase;
        } else if (isTopUpLike) {
            sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
            destinationAccountHint = hintFromDestinationPhrase ?? accountNumberHint ?? fallbackHint;
        } else {
            sourceAccountHint = hintFromSourcePhrase
                ?? sourceAppHint
                ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
            destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
        }
    } else if (type === TransactionType.INCOME) {
        destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
    } else if (type && isSourceOnlyTransactionType(type)) {
        sourceAccountHint = hintFromSourcePhrase ?? accountNumberHint ?? fallbackHint ?? sourceAppHint;
    }

    if (type && isDualAccountTransactionType(type) && sourceAccountHint == destinationAccountHint) {
        if (hintFromSourcePhrase && hintFromSourcePhrase != destinationAccountHint) {
            sourceAccountHint = hintFromSourcePhrase;
        } else if (hintFromDestinationPhrase && hintFromDestinationPhrase != sourceAccountHint) {
            destinationAccountHint = hintFromDestinationPhrase;
        }
    }

    return {
        sourceAccountHint,
        destinationAccountHint
    };
};

export const parseNotificationText = (sourceApp: string, title: string, text: string): ParsedNotification => {
    const combined = `${title} ${text}`.trim();
    const lowerText = normalizeText(combined);

    if (shouldIgnoreRdnFinancialNote(sourceApp, title, text)) {
        return {
            amount: null,
            type: null,
            description: text.trim().slice(0, 160),
            accountHint: null,
            sourceAccountHint: null,
            destinationAccountHint: null,
            confidenceScore: 0,
            parseStatus: 'IGNORED',
            parseNotes: 'Notifikasi Catatan Finansial BCA untuk RDN diabaikan'
        };
    }

    if (shouldIgnorePromotionalNotification(sourceApp, title, text)) {
        return {
            amount: null,
            type: null,
            description: text.trim().slice(0, 160),
            accountHint: null,
            sourceAccountHint: null,
            destinationAccountHint: null,
            confidenceScore: 0,
            parseStatus: 'IGNORED',
            parseNotes: 'Notifikasi promo diabaikan'
        };
    }

    if (shouldIgnoreLikelyChatMessage(sourceApp, title, text)) {
        return {
            amount: null,
            type: null,
            description: text.trim().slice(0, 160),
            accountHint: null,
            sourceAccountHint: null,
            destinationAccountHint: null,
            confidenceScore: 0,
            parseStatus: 'IGNORED',
            parseNotes: 'Pesan chat biasa tanpa penanda transaksi diabaikan'
        };
    }

    if (detectFailedOrCancelledNotification(lowerText)) {
        return {
            amount: null,
            type: null,
            description: text.trim().slice(0, 160),
            accountHint: null,
            sourceAccountHint: null,
            destinationAccountHint: null,
            confidenceScore: 0,
            parseStatus: 'IGNORED',
            parseNotes: 'Notifikasi dibatalkan/gagal, tidak dibuat transaksi otomatis'
        };
    }

    const amount = extractAmount(combined);
    const accountHint = detectAccountHint(combined);
    let type: TransactionType | null = null;
    let confidenceScore = 0.2;
    let parseStatus: ParseStatus = 'FAILED';
    let parseNotes: string | null = 'Format belum dikenali';

    if (detectQrisExpenseNotification(sourceApp, title, text)) {
        type = TransactionType.EXPENSE;
        confidenceScore = 0.92;
    } else if (detectBniIncomingNotification(sourceApp, lowerText)) {
        type = TransactionType.INCOME;
        confidenceScore = 0.9;
    } else if (detectBniOutgoingNotification(sourceApp, lowerText)) {
        type = TransactionType.EXPENSE;
        confidenceScore = 0.88;
    } else if (detectTransferLikeTopUp(sourceApp, lowerText)) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.84;
    } else if (detectTransferOutConfirmation(sourceApp, lowerText)) {
        type = containsAny(lowerText, TRANSFER_KEYWORDS)
            ? TransactionType.TRANSFER
            : TransactionType.EXPENSE;
        confidenceScore = 0.82;
    } else if (INVESTMENT_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.82;
    } else {
        // Hitung skor keyword untuk INCOME vs EXPENSE
        const incomeStrongHit = containsAny(lowerText, STRONG_INCOME_KEYWORDS);
        const expenseStrongHit = detectFeeCharge(lowerText) || containsAny(lowerText, STRONG_EXPENSE_KEYWORDS);
        const incomeAnyHit = containsIncomeSignal(lowerText);
        const expenseAnyHit = containsAny(lowerText, EXPENSE_KEYWORDS);

        if (incomeStrongHit && !expenseStrongHit) {
            // Ada indikasi INCOME kuat, tidak ada EXPENSE kuat → INCOME
            type = TransactionType.INCOME;
            confidenceScore = 0.84;
        } else if (expenseStrongHit && !incomeStrongHit) {
            // Ada indikasi EXPENSE kuat, tidak ada INCOME kuat → EXPENSE
            type = TransactionType.EXPENSE;
            confidenceScore = lowerText.includes('dikenakan biaya') ? 0.88 : 0.8;
        } else if (incomeStrongHit && expenseStrongHit) {
            // Keduanya kuat — gunakan konteks lebih spesifik
            // Jika ada kata 'dari' (uang diterima dari seseorang) → INCOME
            if (lowerText.includes(' dari ') && (lowerText.includes('masuk') || lowerText.includes('diterima'))) {
                type = TransactionType.INCOME;
                confidenceScore = 0.76;
            } else {
                type = TransactionType.EXPENSE;
                confidenceScore = 0.72;
            }
        } else if (incomeAnyHit && !expenseAnyHit) {
            type = TransactionType.INCOME;
            confidenceScore = 0.78;
        } else if (expenseAnyHit && !incomeAnyHit) {
            type = TransactionType.EXPENSE;
            confidenceScore = 0.78;
        } else if (normalizeText(sourceApp).includes('flip') || containsAny(lowerText, TRANSFER_KEYWORDS)) {
            type = TransactionType.TRANSFER;
            confidenceScore = 0.75;
        }
    }

    if (!amount) {
        if (type) {
            parseStatus = 'PENDING';
            parseNotes = 'Nominal tidak ada di teks. Buka notifikasi ini lalu isi nominal secara manual.';
        } else {
            parseStatus = 'IGNORED';
            parseNotes = 'Nominal tidak ditemukan';
        }
    } else if (!type) {
        parseStatus = 'PENDING';
        parseNotes = 'Jenis transaksi perlu ditinjau manual';
        confidenceScore = 0.45;
    } else {
        parseStatus = confidenceScore >= 0.75 ? 'PARSED' : 'PENDING';
        parseNotes = parseStatus === 'PARSED'
            ? 'Parser berhasil mengenali notifikasi'
            : 'Parser butuh konfirmasi tambahan';

        if (isDirectionlessSuccessNotification(lowerText) && !detectBniOutgoingNotification(sourceApp, lowerText)) {
            parseStatus = 'PENDING';
            parseNotes = 'Notifikasi berhasil, tetapi arah dana belum jelas. Konfirmasi jenis dan rekening dulu.';
            confidenceScore = Math.min(confidenceScore, 0.55);
        }

        if (
            type === TransactionType.TRANSFER
            && detectTransferDirection(lowerText) === 'OUT'
            && !detectAccountNumberHint(lowerText)
            && needsDestinationReview(lowerText)
        ) {
            parseStatus = 'PENDING';
            parseNotes = 'Transfer sesama bank terdeteksi. Konfirmasi rekening tujuan dulu, bisa jadi ke rekening sendiri atau orang lain.';
            confidenceScore = Math.min(confidenceScore, 0.7);
        }

        if (parseStatus === 'PARSED' && !detectConfirmedSuccessNotification(lowerText)) {
            parseStatus = 'PENDING';
            parseNotes = 'Nominal terdeteksi, tetapi status sukses transaksi belum jelas. Tinjau dulu sebelum dicatat.';
            confidenceScore = Math.min(confidenceScore, 0.7);
        }
    }

    const { sourceAccountHint, destinationAccountHint } = resolveAccountHints(
        type,
        sourceApp,
        lowerText,
        accountHint
    );
    const displayAccountHint = type && isDualAccountTransactionType(type)
        ? [sourceAccountHint, destinationAccountHint].filter(Boolean).join(' -> ') || accountHint
        : accountHint ?? sourceAccountHint ?? destinationAccountHint;

    const description = buildParsedDescription(sourceApp, title, text, type);

    return {
        amount,
        type,
        description,
        accountHint: displayAccountHint,
        sourceAccountHint,
        destinationAccountHint,
        confidenceScore,
        parseStatus,
        parseNotes
    };
};

const findRelatedBankTopUpSourceAccount = async ({
    notificationId,
    sourceApp,
    amount,
    receivedAt
}: {
    notificationId: string;
    sourceApp: string;
    amount: number;
    receivedAt: Date;
}) => {
    const windowStart = new Date(receivedAt.getTime() - TOP_UP_RECONCILIATION_WINDOW_MS);
    const candidates = await prisma.notificationInbox.findMany({
        where: {
            id: { not: notificationId },
            sourceApp: { not: sourceApp },
            receivedAt: {
                gte: windowStart,
                lte: receivedAt
            },
            parsedAmount: {
                gte: amount,
                lte: amount + TOP_UP_RECONCILIATION_MAX_FEE
            },
            parseStatus: {
                in: ['PENDING', 'PARSED'] as any
            }
        },
        include: {
            transaction: true
        },
        orderBy: { receivedAt: 'desc' },
        take: 10
    });

    for (const candidate of candidates) {
        const candidateSourceHint = detectSourceAppHint(candidate.sourceApp);
        if (!candidateSourceHint || isEWalletHint(candidateSourceHint)) continue;

        const reparsed = parseNotificationText(
            candidate.sourceApp,
            `${candidate.title || ''} ${candidate.senderName || ''}`.trim(),
            candidate.messageText
        );
        const candidateText = normalizeText(`${candidate.title || ''} ${candidate.senderName || ''} ${candidate.messageText}`);
        const direction = detectTransferDirection(candidateText);
        const amountGap = (reparsed.amount ?? 0) - amount;

        if (!reparsed.amount || amountGap < 0 || amountGap > TOP_UP_RECONCILIATION_MAX_FEE) continue;
        if (direction !== 'OUT' && reparsed.type !== TransactionType.EXPENSE && reparsed.type !== TransactionType.TRANSFER) continue;

        const defaults = await ensureDefaults(reparsed, candidate.sourceApp);
        const sourceAccountId = defaults.sourceAccount?.id ?? defaults.account?.id ?? null;
        if (!sourceAccountId) continue;

        return {
            sourceAccountId,
            relatedNotificationId: candidate.id,
            amountGap,
            relatedTransaction: candidate.transaction,
            authoritativeAmount: reparsed.amount
        };
    }

    return null;
};

const findRelatedEWalletTransferToAccount = async ({
    notificationId,
    amount,
    receivedAt,
    destinationAccountId
}: {
    notificationId: string;
    amount: number;
    receivedAt: Date;
    destinationAccountId: string;
}) => {
    const windowStart = new Date(receivedAt.getTime() - TOP_UP_RECONCILIATION_WINDOW_MS);
    const windowEnd = new Date(receivedAt.getTime() + TOP_UP_RECONCILIATION_WINDOW_MS);

    return prisma.transaction.findFirst({
        where: {
            notificationInboxId: { not: notificationId },
            type: TransactionType.TRANSFER,
            amount,
            destinationAccountId,
            date: {
                gte: windowStart,
                lte: windowEnd
            },
            sourceAccount: {
                type: { contains: 'E-Wallet', mode: 'insensitive' }
            }
        },
        include: {
            notificationInbox: true,
            sourceAccount: true,
            destinationAccount: true
        },
        orderBy: { createdAt: 'desc' }
    });
};

const findAccountByHint = async (hint?: string | null) => {
    if (!hint) return null;
    hint = canonicalizeAccountHint(hint);
    if (!hint) return null;

    const normalizedHintDigits = digitsOnly(hint);
    if (normalizedHintDigits.length >= 4) {
        const accounts = await prisma.account.findMany({
            where: {
                accountNumber: { not: null }
            },
            orderBy: { createdAt: 'asc' }
        });

        const matchedByNumber = accounts.find((account) => {
            const accountDigits = digitsOnly(account.accountNumber ?? '');
            return accountDigits === normalizedHintDigits
                || accountDigits.endsWith(normalizedHintDigits)
                || normalizedHintDigits.endsWith(accountDigits);
        });

        if (matchedByNumber) return matchedByNumber;
    }

    const exactNameMatch = await prisma.account.findFirst({
        where: {
            OR: [
                { name: { equals: hint, mode: 'insensitive' } },
                { appPackageName: { equals: hint, mode: 'insensitive' } }
            ]
        },
        orderBy: { createdAt: 'asc' }
    });

    if (exactNameMatch) return exactNameMatch;

    return prisma.account.findFirst({
        where: {
            OR: [
                { name: { contains: hint, mode: 'insensitive' } },
                { type: { contains: hint, mode: 'insensitive' } },
                { accountNumber: { contains: hint, mode: 'insensitive' } },
                { appPackageName: { contains: hint, mode: 'insensitive' } }
            ]
        },
        orderBy: { createdAt: 'asc' }
    });
};

const ensureDefaults = async (
    parsed: Pick<ParsedNotification, 'type' | 'accountHint' | 'sourceAccountHint' | 'destinationAccountHint'>,
    sourceApp?: string | null
) => {
    let owner = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!owner) {
        owner = await prisma.owner.create({ data: { name: 'Owner Utama' } });
    }

    let activity = await prisma.activity.findFirst({ where: { name: 'Lainnya' } });
    if (!activity) {
        activity = await prisma.activity.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    if (!activity) {
        activity = await prisma.activity.create({ data: { name: 'Lainnya' } });
    }

    let sourceAccount = await findAccountByHint(parsed.sourceAccountHint);
    let destinationAccount = await findAccountByHint(parsed.destinationAccountHint);
    let account = await findAccountByHint(parsed.accountHint);

    // If no match by hint, try matching by source app name (e.g. 'BRI', 'BCA')
    if ((!account || (parsed.type && isDualAccountTransactionType(parsed.type) && !destinationAccount)) && sourceApp) {
        const appShort = canonicalizeAccountHint(sourceApp.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
        const sourceAppAccount = await findAccountByHint(appShort);
        account = account ?? sourceAppAccount;

        if (parsed.type && isDualAccountTransactionType(parsed.type) && !sourceAccount) {
            sourceAccount = sourceAppAccount;
        }
    }

    if (!account) {
        account = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });
    }

    if (parsed.type === TransactionType.INCOME) {
        destinationAccount = destinationAccount ?? account;
    }

    if (parsed.type && isSourceOnlyTransactionType(parsed.type)) {
        sourceAccount = sourceAccount ?? account;
    }

    const ownerId = sourceAccount?.ownerId ?? destinationAccount?.ownerId ?? account?.ownerId;
    if (ownerId) {
        owner = await prisma.owner.findUnique({ where: { id: ownerId } }) ?? owner;
    }

    return { owner, activity, account, sourceAccount, destinationAccount };
};

router.get('/test', (_req, res) => {
    res.json({ 
        ok: true, 
        message: 'Webhook router is working',
        prismaKeys: Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'))
    });
});

router.get('/notifications', async (req, res) => {
    try {
        const limit = Number(req.query.limit);
        const parseStatus = typeof req.query.parseStatus === 'string'
            ? req.query.parseStatus
            : undefined;
        const where = parseStatus
            ? { parseStatus: parseStatus as any }
            : { parseStatus: { not: 'IGNORED' as any } };

        const notifications = await prisma.notificationInbox.findMany({
            where,
            include: {
                transaction: {
                    include: {
                        owner: true,
                        activity: true,
                        sourceAccount: true,
                        destinationAccount: true
                    }
                }
            },
            orderBy: { receivedAt: 'desc' },
            ...(Number.isFinite(limit) && limit > 0 ? { take: limit } : { take: 50 })
        });

        res.json(notifications);
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Gagal mengambil inbox notifikasi' });
    }
});

router.delete('/notifications/:id', async (req, res) => {
    try {
        const notification = await prisma.notificationInbox.findUnique({
            where: { id: req.params.id },
            include: { transaction: true }
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });
        }

        if (notification.transaction) {
            return res.status(409).json({ error: 'Notifikasi sudah terkait transaksi dan tidak bisa dihapus langsung' });
        }

        await prisma.notificationInbox.delete({
            where: { id: req.params.id }
        });

        res.json({ ok: true });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Gagal menghapus notifikasi' });
    }
});

router.delete('/notifications', async (_req, res) => {
    try {
        const result = await prisma.notificationInbox.deleteMany({
            where: {
                transaction: { is: null }
            }
        });

        res.json({ ok: true, deleted: result.count });
    } catch (error) {
        console.error('Clear notifications error:', error);
        res.status(500).json({ error: 'Gagal mengosongkan inbox notifikasi' });
    }
});

router.post('/notification', async (req, res) => {
    try {
        const { appName, text, title, senderName, receivedAt, rawPayload } = req.body;

        if (!appName || !text) {
            return res.status(400).json({ error: 'appName dan text wajib diisi' });
        }

        const packageName = rawPayload?.packageName || '';
        const isEmailNotification = isEmailPackage(String(packageName));

        if (
            isEmailNotification
            && !shouldProcessEmailNotification(
                String(appName),
                String(senderName || ''),
                String(title || ''),
                String(text || '')
            )
        ) {
            return res.status(200).json({
                message: `Notifikasi email dari ${packageName} diabaikan karena tidak terindikasi transaksi`,
                skipped: true
            });
        }

        const parsed = parseNotificationText(
            String(appName),
            `${String(title || '')} ${String(senderName || '')}`.trim(),
            String(text)
        );

        // Cek apakah ini adalah peringatan keamanan (login gagal, aktivitas mencurigakan, dll)
        const isSecurityAlert = detectSecurityAlert(`${title || ''} ${senderName || ''} ${text}`);

        // Jangan simpan notifikasi ke database jika tidak ada nominal dan bukan peringatan keamanan
        if (parsed.parseStatus === 'IGNORED' && !isSecurityAlert) {
            return res.status(200).json({
                message: 'Notifikasi diabaikan karena tidak mengandung nominal transaksi',
                parsed
            });
        }

        // Simpan peringatan keamanan ke inbox meskipun tidak ada nominal
        if (parsed.parseStatus === 'IGNORED' && isSecurityAlert) {
            const securityNotification = await prisma.notificationInbox.create({
                data: {
                    sourceApp: String(appName),
                    senderName: senderName ? String(senderName) : null,
                    title: title ? String(title) : null,
                    messageText: String(text),
                    receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
                    parseStatus: 'FAILED' as any,
                    parsedType: null,
                    parsedAmount: null,
                    parsedDescription: String(text).slice(0, 160),
                    parsedAccountHint: null,
                    confidenceScore: 0,
                    parseNotes: '⚠️ Peringatan Keamanan: Aktivitas login mencurigakan terdeteksi',
                    rawPayload: rawPayload ?? req.body
                }
            });
            return res.status(201).json({
                success: true,
                notification: securityNotification,
                createdTransaction: false,
                reason: 'security_alert'
            });
        }

        // Cegah notif ganda untuk event yang sama, termasuk pasangan notif generik + detail.
        if (parsed.amount) {
            const duplicateSince = new Date(Date.now() - DUPLICATE_NOTIFICATION_WINDOW_MS);
            const duplicateCandidates = await prisma.notificationInbox.findMany({
                where: {
                    parsedAmount: parsed.amount,
                    receivedAt: { gte: duplicateSince },
                    parseStatus: { not: 'IGNORED' }
                },
                orderBy: { receivedAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    sourceApp: true,
                    title: true,
                    senderName: true,
                    messageText: true,
                    parsedType: true
                }
            });
            const duplicate = duplicateCandidates.find((candidate) => isLikelyDuplicateNotificationPair({
                sourceApp: String(appName),
                title: title ? String(title) : '',
                senderName: senderName ? String(senderName) : '',
                text: String(text),
                parsedType: parsed.type,
                existing: candidate
            }));

            if (duplicate) {
                return res.status(200).json({
                    message: `Notifikasi diabaikan karena dideteksi sebagai duplikat dari transaksi Rp${parsed.amount}`,
                    parsed,
                    isDuplicate: true,
                    duplicateOfId: duplicate.id
                });
            }
        }

        const notification = await prisma.notificationInbox.create({
            data: {
                sourceApp: String(appName),
                senderName: senderName ? String(senderName) : null,
                title: title ? String(title) : null,
                messageText: String(text),
                receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
                parseStatus: parsed.parseStatus as any,
                parsedType: parsed.type ?? null,
                parsedAmount: parsed.amount ?? null,
                parsedDescription: parsed.description ?? null,
                parsedAccountHint: parsed.accountHint ?? null,
                confidenceScore: parsed.confidenceScore ?? null,
                parseNotes: parsed.parseNotes ?? null,
                rawPayload: rawPayload ?? req.body
            }
        });

        const sourceAppHint = detectSourceAppHint(String(appName));
        const destinationHintDigits = digitsOnly(parsed.destinationAccountHint ?? '');
        const hintedDestinationAccount = parsed.destinationAccountHint
            ? await findAccountByHint(parsed.destinationAccountHint)
            : null;
        const needsDestinationConfirmation = parsed.type === TransactionType.TRANSFER
            && Boolean(sourceAppHint && E_WALLET_APPS.includes(sourceAppHint))
            && destinationHintDigits.length >= 4
            && !hintedDestinationAccount;

        if (needsDestinationConfirmation) {
            const confirmationNote = `Rekening tujuan *${destinationHintDigits.slice(-4)} belum terdaftar. Konfirmasi atau tambahkan rekening dulu.`;
            await prisma.notificationInbox.update({
                where: { id: notification.id },
                data: {
                    parseStatus: 'PENDING' as any,
                    parseNotes: confirmationNote
                }
            });

            return res.status(202).json({
                success: true,
                notification: {
                    ...notification,
                    parseStatus: 'PENDING',
                    parseNotes: confirmationNote
                },
                createdTransaction: false,
                reason: confirmationNote
            });
        }

        // Abaikan auto-create hanya jika parser gagal total atau data dasarnya belum cukup.
        // Notifikasi PENDING yang sudah punya nominal + tipe tetap boleh dibuat sebagai transaksi review.
        if (!shouldCreateTransactionFromNotification(parsed)) {
            return res.status(202).json({
                success: true,
                notification,
                createdTransaction: false,
                reason: parsed.parseNotes
            });
        }

        // Selalu coba buat transaksi (pending) jika ada amount + type, apapun confidence-nya
        // Transaksi akan dibuat dengan isValidated: false agar user bisa approve/reject di Home
        const { owner, activity, account, sourceAccount, destinationAccount } = await ensureDefaults(parsed, String(appName));
        let effectiveType = parsed.type;
        let effectiveAmount = parsed.amount;
        let sourceAccountId = parsed.type && isDualAccountTransactionType(parsed.type)
            ? sourceAccount?.id ?? null
            : parsed.type && isSourceOnlyTransactionType(parsed.type)
                ? sourceAccount?.id ?? account?.id ?? null
                : null;
        let destinationAccountId = parsed.type && isDualAccountTransactionType(parsed.type)
            ? destinationAccount?.id ?? null
            : parsed.type === TransactionType.INCOME
                ? destinationAccount?.id ?? account?.id ?? null
                : null;
        const normalizedNotificationText = normalizeText(`${title || senderName || ''} ${text}`);

        let missingAccountReason = (
            ((effectiveType && isDualAccountTransactionType(effectiveType)) && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId))
            || (effectiveType === TransactionType.INCOME && !destinationAccountId)
            || ((effectiveType && isSourceOnlyTransactionType(effectiveType)) && !sourceAccountId)
        )
            ? (
                effectiveType && isDualAccountTransactionType(effectiveType)
                    ? 'Rekening transfer belum lengkap atau masih sama'
                    : 'Rekening transaksi belum berhasil dipetakan'
            )
            : null;

        if (effectiveType && isDualAccountTransactionType(effectiveType) && missingAccountReason) {
            const transferDirection = detectTransferDirection(normalizedNotificationText);
            const isTransferLikeTopUp = detectTransferLikeTopUp(String(appName), normalizedNotificationText);

            if (isTransferLikeTopUp) {
                const sourceAppHint = detectSourceAppHint(String(appName));
                const sourceAppLooksLikeEWallet = sourceAppHint ? E_WALLET_APPS.includes(sourceAppHint) : false;
                const recoveredSourceAccountId = sourceAppLooksLikeEWallet
                    ? sourceAccount?.id ?? null
                    : sourceAccount?.id ?? account?.id ?? null;
                const recoveredDestinationAccountId = sourceAppLooksLikeEWallet
                    ? destinationAccount?.id ?? account?.id ?? null
                    : destinationAccount?.id ?? null;

                const relatedBankSource = (
                    sourceAppLooksLikeEWallet
                    && parsed.amount
                    && recoveredDestinationAccountId
                )
                    ? await findRelatedBankTopUpSourceAccount({
                        notificationId: notification.id,
                        sourceApp: String(appName),
                        amount: parsed.amount,
                        receivedAt: notification.receivedAt
                    })
                    : null;

                if (
                    relatedBankSource?.sourceAccountId
                    && recoveredDestinationAccountId
                    && relatedBankSource.sourceAccountId !== recoveredDestinationAccountId
                ) {
                    if (relatedBankSource.relatedTransaction) {
                        await prisma.transaction.delete({
                            where: { id: relatedBankSource.relatedTransaction.id }
                        });
                    }

                    await prisma.notificationInbox.update({
                        where: { id: relatedBankSource.relatedNotificationId },
                        data: {
                            parseNotes: 'Notifikasi bank direkonsiliasi dengan transaksi top up e-wallet'
                        }
                    });

                    effectiveType = TransactionType.TRANSFER;
                    effectiveAmount = relatedBankSource.authoritativeAmount;
                    sourceAccountId = relatedBankSource.sourceAccountId;
                    destinationAccountId = recoveredDestinationAccountId;
                } else if (
                    recoveredSourceAccountId
                    && recoveredDestinationAccountId
                    && recoveredSourceAccountId !== recoveredDestinationAccountId
                ) {
                    effectiveType = TransactionType.TRANSFER;
                    sourceAccountId = recoveredSourceAccountId;
                    destinationAccountId = recoveredDestinationAccountId;
                } else if (sourceAppLooksLikeEWallet) {
                    effectiveType = TransactionType.INCOME;
                    destinationAccountId = destinationAccount?.id ?? account?.id ?? sourceAccount?.id ?? null;
                    sourceAccountId = null;
                } else {
                    effectiveType = TransactionType.EXPENSE;
                    sourceAccountId = sourceAccount?.id ?? account?.id ?? destinationAccount?.id ?? null;
                    destinationAccountId = null;
                }
            } else if (transferDirection === 'OUT') {
                effectiveType = TransactionType.EXPENSE;
                sourceAccountId = sourceAccount?.id ?? account?.id ?? destinationAccount?.id ?? null;
                destinationAccountId = null;
            } else if (transferDirection === 'IN') {
                effectiveType = TransactionType.INCOME;
                destinationAccountId = destinationAccount?.id ?? account?.id ?? sourceAccount?.id ?? null;
                sourceAccountId = null;
            }

            missingAccountReason = (
                (effectiveType === TransactionType.INCOME && !destinationAccountId)
                || (effectiveType === TransactionType.EXPENSE && !sourceAccountId)
                || ((effectiveType && isDualAccountTransactionType(effectiveType)) && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId))
            )
                ? (
                    effectiveType && isDualAccountTransactionType(effectiveType)
                        ? 'Rekening transfer belum lengkap atau masih sama'
                        : 'Rekening transaksi belum berhasil dipetakan'
                )
                : null;
        }

        if (
            effectiveType === TransactionType.INCOME
            && parsed.amount
            && destinationAccountId
        ) {
            const relatedEWalletTransfer = await findRelatedEWalletTransferToAccount({
                notificationId: notification.id,
                amount: parsed.amount,
                receivedAt: notification.receivedAt,
                destinationAccountId
            });

            if (relatedEWalletTransfer) {
                const reconciledNotification = await prisma.notificationInbox.update({
                    where: { id: notification.id },
                    data: {
                        parseStatus: 'PARSED',
                        parseNotes: `Direkonsiliasi dengan transfer ${relatedEWalletTransfer.sourceAccount?.name ?? 'e-wallet'} ke ${relatedEWalletTransfer.destinationAccount?.name ?? 'rekening tujuan'}`
                    }
                });

                return res.status(200).json({
                    success: true,
                    notification: reconciledNotification,
                    createdTransaction: false,
                    reason: 'reconciled_with_existing_ewallet_transfer',
                    relatedTransactionId: relatedEWalletTransfer.id
                });
            }
        }

        const isMissingCriticalFields = !owner || !activity || (!account && !sourceAccount && !destinationAccount) || missingAccountReason;

        // Perbarui saja parseStatus menjadi PENDING jika data kurang lengkap
        if (isMissingCriticalFields) {
            await prisma.notificationInbox.update({
                where: { id: notification.id },
                data: {
                    parseStatus: 'PENDING',
                    parseNotes: missingAccountReason ?? 'Master owner/activity/account belum lengkap'
                }
            });

            // Untuk TRANSFER yang rekening-nya benar-benar belum bisa dipecahkan → kembalikan 202
            if (effectiveType && isDualAccountTransactionType(effectiveType) && missingAccountReason) {
                const pendingNotification = await prisma.notificationInbox.findUnique({ where: { id: notification.id } });
                return res.status(202).json({
                    success: true,
                    notification: pendingNotification,
                    createdTransaction: false,
                    reason: missingAccountReason
                });
            }

            if (missingAccountReason) {
                const pendingNotification = await prisma.notificationInbox.findUnique({ where: { id: notification.id } });
                return res.status(202).json({
                    success: true,
                    notification: pendingNotification,
                    createdTransaction: false,
                    reason: missingAccountReason
                });
            }

            // Untuk INCOME/EXPENSE: jika tidak ada owner atau activity, return 202 (tidak bisa buat transaksi)
            if (!owner || !activity) {
                const pendingNotification = await prisma.notificationInbox.findUnique({ where: { id: notification.id } });
                return res.status(202).json({
                    success: true,
                    notification: pendingNotification,
                    createdTransaction: false,
                    reason: 'Master data (owner/activity) belum ada, silakan tambahkan terlebih dahulu'
                });
            }
        }

        if (effectiveType !== parsed.type) {
            await prisma.notificationInbox.update({
                where: { id: notification.id },
                data: {
                    parseStatus: 'PARSED',
                    parsedType: effectiveType,
                    parseNotes: 'Transfer ambigu dicatat otomatis sebagai transaksi satu rekening'
                }
            });
        }

        if (effectiveAmount == null || !effectiveType) {
            return res.status(202).json({
                success: true,
                notification,
                createdTransaction: false,
                reason: 'Nominal atau tipe transaksi belum final'
            });
        }

        const shouldAutoValidate = shouldAutoValidateNotificationTransaction(parsed);
        const transaction = await prisma.transaction.create({
            data: {
                amount: effectiveAmount,
                type: effectiveType,
                date: notification.receivedAt,
                description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
                ownerId: owner!.id,
                activityId: activity!.id,
                isValidated: shouldAutoValidate,
                notificationInboxId: notification.id,
                ...(sourceAccountId ? { sourceAccountId } : {}),
                ...(destinationAccountId ? { destinationAccountId } : {})
            }
        });

        await syncAccountBalances(prisma);

        res.status(201).json({
            success: true,
            notification,
            transaction,
            createdTransaction: true
        });
    } catch (error: any) {
        console.error('[Webhook Error]:', error);
        const detailMessage = String(error?.message || '');
        const schemaHint = detailMessage.includes('prisma.notificationInbox')
            || detailMessage.includes('NotificationInbox')
            || detailMessage.includes('The table')
            ? 'Schema backend belum sinkron. Jalankan deploy backend yang menyertakan `prisma db push`.'
            : undefined;
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: detailMessage,
            hint: schemaHint,
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        });
    }
});

export default router;
