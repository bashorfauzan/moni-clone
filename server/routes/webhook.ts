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

const ACCOUNT_HINTS = ['bca', 'bsya', 'bni', 'wondr', 'bri', 'brimo', 'mandiri', 'livin', 'seabank', 'jago', 'blu', 'bsi', 'btpn', 'jenius', 'rhb', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip', 'ovo', 'dana', 'paypal'];
const INCOME_KEYWORDS = ['masuk', 'menerima', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'kredit', 'cr ', 'top up berhasil', 'berhasil top up', 'setor tunai', 'penerimaan', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'transfer keluar', 'debit', 'db ', 'dr ', 'transaksi berhasil', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya', 'biaya admin', 'biaya layanan', 'fee'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'pengiriman'];
const TRANSFER_OUT_KEYWORDS = ['dikirim', 'mengirim', 'kirim ke', 'transfer ke', 'pindah ke', 'ditransfer ke', 'pembayaran'];
const TRANSFER_IN_KEYWORDS = ['diterima', 'menerima', 'transfer masuk', 'dana masuk', 'masuk dari', 'ditransfer dari'];
// Keywords yang sangat kuat mengindikasikan INCOME (prioritas tinggi vs EXPENSE ambiguous)
const STRONG_INCOME_KEYWORDS = ['masuk', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'penerimaan', 'pemasukan', 'setor tunai'];
const STRONG_EXPENSE_KEYWORDS = ['bayar', 'membayar', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya admin', 'biaya layanan'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'ipo', 'ajaib', 'rhb', 'philip', 'sinarmas sekuritas', 'ciptadana'];
const E_WALLET_APPS = ['dana', 'gopay', 'ovo', 'shopeepay', 'flip'];
const CHAT_APP_HINTS = ['whatsapp', 'wa business', 'telegram', 'line', 'discord', 'messenger', 'instagram', 'facebook', 'signal'];
const EMAIL_PACKAGE_HINTS = ['com.google.android.gm', 'com.microsoft.office.outlook'];
const PROMO_KEYWORDS = [
    'promo', 'promosi', 'diskon', 'voucher', 'cashback spesial', 'cashback hingga',
    'kesempatan terbatas', 'penawaran', 'pakai', 'pertama kali', 'khusus hari ini',
    'berlaku sampai', 's.d.', 'sd.', 'hemat', 'bonus', 'kupon', 'kode promo',
    'simpan kartu bankmu', 'lebih mudah', 'coba yuk'
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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const ACCOUNT_HINT_ALIASES: Record<string, string> = {
    brimo: 'bri',
    mybca: 'bca',
    livin: 'mandiri',
    wondr: 'bni',
    bsya: 'bca'
};

const canonicalizeAccountHint = (hint?: string | null) => {
    if (!hint) return null;
    const normalized = normalizeText(hint);
    return ACCOUNT_HINT_ALIASES[normalized] ?? normalized;
};

const extractAmount = (text: string) => {
    // Handle Indonesian format: Rp2.700.000,00 OR Rp 2.700.000
    const candidates = [
        text.match(/rp\s*([\d.,]+)/i),
        text.match(/\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\b/),
        text.match(/\b(\d{5,})\b/)
    ];

    for (const match of candidates) {
        const raw = match?.[1];
        if (!raw) continue;

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
    const mentionsTopUp = text.includes('top up') || text.includes('topup') || text.includes('pengisian saldo') || text.includes('isi saldo');
    if (!mentionsTopUp) return false;

    return E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
        || E_WALLET_APPS.some((app) => text.includes(app))
        || text.includes('saldo')
        || text.includes('dari ');
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
    if (!hasPromoKeyword) return false;

    const hasTransactionalProof = [
        'transaksi berhasil', 'berhasil ditransfer', 'telah dikirim', 'dikirim ke',
        'diterima dari', 'nomor referensi', 'no. referensi', 'ref:', 'sisa saldo',
        'saldo akhir', 'mutasi', 'debit', 'kredit', 'tarik tunai', 'va ', 'briva'
    ].some((keyword) => combined.includes(keyword));

    if (hasTransactionalProof) return false;

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
    if (text.includes('rekening tujuan') || text.includes('nomor rekening tujuan')) return 'OUT';
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
        'transfer dana ke rekening sesama'
    ]);
};

const resolveAccountHints = (
    type: TransactionType | null,
    sourceApp: string,
    text: string,
    fallbackHint: string | null
) => {
    const sourceAppHint = detectSourceAppHint(sourceApp);
    const hintFromSourcePhrase = detectHintAfterAnchors(text, ['dari ', 'via ', 'dr ']);
    const hintFromDestinationPhrase = detectHintAfterAnchors(text, ['ke rekening ', 'ke ', 'tujuan ', 'top up ', 'topup ', 'pengisian saldo ', 'isi saldo ']);
    const accountNumberHint = detectAccountNumberHint(text);
    const transferDirection = detectTransferDirection(text);

    let sourceAccountHint: string | null = null;
    let destinationAccountHint: string | null = null;

    if (type && isDualAccountTransactionType(type)) {
        if (transferDirection === 'OUT') {
            sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
        } else if (transferDirection === 'IN') {
            sourceAccountHint = hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? sourceAppHint ?? fallbackHint ?? hintFromDestinationPhrase;
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

const parseNotificationText = (sourceApp: string, title: string, text: string): ParsedNotification => {
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

    if (detectTransferLikeTopUp(sourceApp, lowerText)) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.84;
    } else if (INVESTMENT_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.82;
    } else {
        // Hitung skor keyword untuk INCOME vs EXPENSE
        const incomeStrongHit = containsAny(lowerText, STRONG_INCOME_KEYWORDS);
        const expenseStrongHit = detectFeeCharge(lowerText) || containsAny(lowerText, STRONG_EXPENSE_KEYWORDS);
        const incomeAnyHit = containsAny(lowerText, INCOME_KEYWORDS);
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

        if (isDirectionlessSuccessNotification(lowerText)) {
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

    return {
        amount,
        type,
        description: text.trim().slice(0, 160),
        accountHint: displayAccountHint,
        sourceAccountHint,
        destinationAccountHint,
        confidenceScore,
        parseStatus,
        parseNotes
    };
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
                transaction: null
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

        // Cek duplikasi (Debounce): Apakah ada notifikasi dari aplikasi yang sama, 
        // dengan nominal yang SAMA dan tipe yang SAMA masuk dalam 1 menit terakhir?
        if (parsed.amount) {
            const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000);
            const duplicate = await prisma.notificationInbox.findFirst({
                where: {
                    sourceApp: String(appName),
                    parsedAmount: parsed.amount,
                    receivedAt: { gte: oneMinAgo },
                    parseStatus: { not: 'IGNORED' }, // Hanya cek terhadap notif yg valid
                    ...(parsed.type ? { parsedType: parsed.type } : {})
                }
            });

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

        // Jika belum cukup yakin / data belum lengkap, simpan dulu ke inbox untuk konfirmasi user
        if (!parsed.amount || !parsed.type || parsed.parseStatus !== 'PARSED') {
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

                if (
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

        // Buat transaksi langsung tervalidasi — sesuai request user ("langsung masuk, tidak perlu persetujuan")
        const transaction = await prisma.transaction.create({
            data: {
                amount: parsed.amount,
                type: effectiveType,
                date: notification.receivedAt,
                description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
                ownerId: owner!.id,
                activityId: activity!.id,
                isValidated: true,
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
