import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Transation types hardcoded to avoid Prisma dependency
const TransactionType = {
    INCOME: 'INCOME',
    EXPENSE: 'EXPENSE',
    TRANSFER: 'TRANSFER',
    INVESTMENT_IN: 'INVESTMENT_IN',
    INVESTMENT_OUT: 'INVESTMENT_OUT'
} as const;
type TransactionType = keyof typeof TransactionType;

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
const CHAT_APP_HINTS = ['whatsapp', 'wa business', 'telegram', 'line', 'discord', 'messenger', 'instagram', 'facebook', 'signal'];
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

const extractAmount = (text: string) => {
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
    // JANGAN klasifikasi notifikasi biaya/fee sebagai transfer
    if (text.includes('dikenakan biaya') || text.includes('biaya admin') || text.includes('biaya layanan')) return false;
    const mentionsTopUp = text.includes('top up') || text.includes('topup') || text.includes('pengisian saldo') || text.includes('isi saldo');
    // E-wallet "telah dikirim ke" = transfer keluar
    const isEwalletTransfer = E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
        && (text.includes('dikirim ke') || text.includes('telah dikirim'));
    if (isEwalletTransfer) return true;
    // BRImo/Bank "Top Up DANA/OVO/ShopeePay" = transfer ke e-wallet
    const isBankTopUpEwallet = mentionsTopUp && E_WALLET_APPS.some((app) => text.includes(app));
    if (isBankTopUpEwallet) return true;
    if (!mentionsTopUp) return false;
    return E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
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

const shouldIgnoreLikelyChatMessage = (sourceApp: string, title: string, text: string) => {
    if (!isChatAppSource(sourceApp)) return false;

    const combined = `${title} ${text}`.trim();

    if (hasExplicitMoneyMarker(combined)) return false;
    if (detectAccountHint(combined)) return false;
    if (detectSecurityAlert(combined)) return false;

    return true;
};

const detectSourceAppHint = (sourceApp: string) => {
    return detectAccountHint(sourceApp);
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
    if (containsAny(text, TRANSFER_OUT_KEYWORDS)) return 'OUT';
    if (containsAny(text, TRANSFER_IN_KEYWORDS)) return 'IN';
    return 'UNKNOWN';
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

    if (type === TransactionType.TRANSFER) {
        if (transferDirection === 'OUT') {
            sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase;
        } else if (transferDirection === 'IN') {
            sourceAccountHint = hintFromSourcePhrase;
            destinationAccountHint = accountNumberHint ?? sourceAppHint ?? fallbackHint ?? hintFromDestinationPhrase;
        } else {
            sourceAccountHint = hintFromSourcePhrase
                ?? sourceAppHint
                ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
            destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase;
        }
    } else if (type === TransactionType.INCOME) {
        destinationAccountHint = accountNumberHint ?? hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
    } else if (type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT_OUT) {
        sourceAccountHint = hintFromSourcePhrase ?? accountNumberHint ?? fallbackHint ?? sourceAppHint;
    }

    if (type === TransactionType.TRANSFER && sourceAccountHint == destinationAccountHint) {
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

    const amount = extractAmount(combined);
    const accountHint = detectAccountHint(combined);
    let type: TransactionType | null = null;
    let confidenceScore = 0.2;
    let parseStatus: ParseStatus = 'FAILED';
    let parseNotes: string | null = 'Format belum dikenali';

    if (INVESTMENT_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.INVESTMENT_OUT;
        confidenceScore = 0.82;
    } else if (detectFeeCharge(lowerText)) {
        // Prioritas tinggi: notifikasi biaya/fee SELALU expense
        type = TransactionType.EXPENSE;
        confidenceScore = 0.9;
    } else if (detectTransferLikeTopUp(sourceApp, lowerText)) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.78;
    } else {
        const incomeStrongHit = containsAny(lowerText, STRONG_INCOME_KEYWORDS);
        const expenseStrongHit = detectFeeCharge(lowerText) || containsAny(lowerText, STRONG_EXPENSE_KEYWORDS);
        const incomeAnyHit = containsAny(lowerText, INCOME_KEYWORDS);
        const expenseAnyHit = containsAny(lowerText, EXPENSE_KEYWORDS);

        if (incomeStrongHit && !expenseStrongHit) {
            type = TransactionType.INCOME;
            confidenceScore = 0.84;
        } else if (expenseStrongHit && !incomeStrongHit) {
            type = TransactionType.EXPENSE;
            confidenceScore = lowerText.includes('dikenakan biaya') ? 0.88 : 0.8;
        } else if (incomeStrongHit && expenseStrongHit) {
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
        } else if (
            normalizeText(sourceApp).includes('flip')
            || containsAny(lowerText, TRANSFER_KEYWORDS)
        ) {
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
    }

    const { sourceAccountHint, destinationAccountHint } = resolveAccountHints(
        type,
        sourceApp,
        lowerText,
        accountHint
    );
    const displayAccountHint = type === TransactionType.TRANSFER
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

const getSupabaseAdminConfig = () => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib tersedia untuk webhook');
    }

    return { supabaseUrl, serviceRoleKey };
};

const getSupabaseAdmin = () => {
    const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

const toSerializableJson = (value: unknown) => {
    if (value === undefined) return null;

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return {
            serializationError: 'rawPayload tidak bisa diserialisasi',
            fallbackType: typeof value
        };
    }
};

const insertNotificationInbox = async (payload: Record<string, unknown>) => {
    const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
    const nowIso = new Date().toISOString();
    const payloadWithTimestamps = {
        createdAt: nowIso,
        updatedAt: nowIso,
        ...payload
    };
    const response = await fetch(`${supabaseUrl}/rest/v1/NotificationInbox`, {
        method: 'POST',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
        },
        body: JSON.stringify(payloadWithTimestamps)
    });

    const responseText = await response.text();
    let parsedResponse: any = null;

    try {
        parsedResponse = responseText ? JSON.parse(responseText) : null;
    } catch {
        parsedResponse = responseText;
    }

    if (!response.ok) {
        const details = typeof parsedResponse === 'string'
            ? parsedResponse
            : parsedResponse?.message || parsedResponse?.error || JSON.stringify(parsedResponse);
        throw new Error(`Gagal menyimpan notifikasi: ${details}`);
    }

    if (!Array.isArray(parsedResponse) || !parsedResponse[0]) {
        throw new Error('Gagal menyimpan notifikasi: respons insert NotificationInbox kosong');
    }

    return parsedResponse[0];
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabaseAdmin();
        const { appName, text, title, senderName, receivedAt, rawPayload } = req.body;

        if (!appName || !text) {
            return res.status(400).json({ error: 'appName dan text wajib diisi' });
        }

        // Skip Gmail — email konfirmasi bank sudah ditangani oleh notifikasi push BRImo/BCA/Flip
        const packageName = rawPayload?.packageName || '';
        const SKIPPED_PACKAGES = ['com.google.android.gm', 'com.microsoft.office.outlook'];
        if (SKIPPED_PACKAGES.includes(packageName)) {
            return res.status(200).json({
                message: `Notifikasi dari ${packageName} diabaikan (sudah ditangani oleh app banking)`,
                skipped: true
            });
        }

        // Potong teks agar tidak menyebabkan timeout pada email panjang
        const trimmedText = String(text).slice(0, 500);

        const parsed = parseNotificationText(
            String(appName),
            String(title || senderName || ''),
            trimmedText
        );

        const isSecurityAlert = detectSecurityAlert(`${title || ''} ${trimmedText}`);
        const serializedPayload = toSerializableJson(rawPayload ?? req.body);

        if (parsed.parseStatus === 'IGNORED' && !isSecurityAlert) {
            return res.status(200).json({
                message: 'Notifikasi diabaikan karena tidak mengandung nominal transaksi',
                parsed
            });
        }

        const nowIso = receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString();

        if (parsed.parseStatus === 'IGNORED' && isSecurityAlert) {
            const securityNotification = await insertNotificationInbox({
                id: crypto.randomUUID(),
                sourceApp: String(appName),
                senderName: senderName ? String(senderName) : null,
                title: title ? String(title) : null,
                messageText: trimmedText,
                receivedAt: nowIso,
                parseStatus: 'FAILED',
                parsedType: null,
                parsedAmount: null,
                parsedDescription: trimmedText.slice(0, 160),
                parsedAccountHint: null,
                confidenceScore: 0,
                parseNotes: '⚠️ Peringatan Keamanan: Aktivitas login mencurigakan terdeteksi',
                rawPayload: serializedPayload
            });

            return res.status(201).json({
                success: true,
                notification: securityNotification,
                createdTransaction: false,
                reason: 'security_alert'
            });
        }

        if (parsed.amount) {
            const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
            
            // Cek duplikasi LINTAS APLIKASI DAN LINTAS TIPE:
            // Satu transaksi top-up menghasilkan notifikasi dari BRImo (EXPENSE/TRANSFER)
            // dan DANA (INCOME/TRANSFER) dengan nominal sama. Abaikan tipe saat cek duplikat.
            const { data: duplicates } = await supabase.from('NotificationInbox')
                .select('id, sourceApp, parsedType')
                .eq('parsedAmount', parsed.amount)
                .gte('createdAt', threeMinAgo)
                .neq('parseStatus', 'IGNORED')
                .limit(1);

            if (duplicates && duplicates.length > 0) {
                return res.status(200).json({
                    message: `Notifikasi diabaikan karena dideteksi sebagai duplikat dari transaksi Rp${parsed.amount} (dari ${duplicates[0].sourceApp})`,
                    parsed,
                    isDuplicate: true,
                    duplicateOfId: duplicates[0].id
                });
            }
        }

        const notification = await insertNotificationInbox({
            id: crypto.randomUUID(),
            sourceApp: String(appName),
            senderName: senderName ? String(senderName) : null,
            title: title ? String(title) : null,
            messageText: trimmedText,
            receivedAt: nowIso,
            parseStatus: parsed.parseStatus,
            parsedType: parsed.type,
            parsedAmount: parsed.amount,
            parsedDescription: parsed.description,
            parsedAccountHint: parsed.accountHint,
            confidenceScore: parsed.confidenceScore,
            parseNotes: parsed.parseNotes,
            rawPayload: serializedPayload
        });

        if (!parsed.amount || !parsed.type || parsed.parseStatus !== 'PARSED') {
            return res.status(202).json({
                success: true,
                notification,
                createdTransaction: false,
                reason: parsed.parseNotes
            });
        }

        // --- Fetch Defaults ---
        const { data: owners } = await supabase.from('Owner').select('*').order('createdAt', { ascending: true }).limit(1);
        let owner = owners?.[0];
        if (!owner) {
            const ownerNow = new Date().toISOString();
            const { data: newOwner } = await supabase.from('Owner').insert({ id: crypto.randomUUID(), name: 'Owner Utama', createdAt: ownerNow, updatedAt: ownerNow }).select().single();
            owner = newOwner;
        }

        const { data: activities } = await supabase.from('Activity').select('*').eq('name', 'Lainnya').limit(1);
        let activity = activities?.[0];
        if (!activity) {
            const { data: fallbackActivities } = await supabase.from('Activity').select('*').order('createdAt', { ascending: true }).limit(1);
            activity = fallbackActivities?.[0];
            if (!activity) {
                const actNow = new Date().toISOString();
                const { data: newActivity } = await supabase.from('Activity').insert({ id: crypto.randomUUID(), name: 'Lainnya', createdAt: actNow, updatedAt: actNow }).select().single();
                activity = newActivity;
            }
        }

        const findAccountByHint = async (hint: string | null) => {
            if (!hint) return null;
            const { data: allAccounts } = await supabase.from('Account').select('*').order('createdAt', { ascending: true });
            if (!allAccounts || allAccounts.length === 0) return null;

            const hintLower = hint.toLowerCase();
            const hintDigits = digitsOnly(hint);

            if (hintDigits.length >= 4) {
                const numberExactMatch = allAccounts.find(a => {
                    const accountDigits = digitsOnly(a.accountNumber || '');
                    return accountDigits === hintDigits
                        || accountDigits.endsWith(hintDigits)
                        || hintDigits.endsWith(accountDigits);
                });
                if (numberExactMatch) return numberExactMatch;
            }

            // 1. Exact name match (case-insensitive) — e.g. hint='bri' matches 'BRI Bashor' but not 'BRI Sekuritas'
            //    Prioritas: nama akun yang DIMULAI dengan hint
            const startsWithMatch = allAccounts.find(a =>
                a.name?.toLowerCase().startsWith(hintLower) ||
                a.name?.toLowerCase().split(' ').some((word: string) => word === hintLower)
            );
            if (startsWithMatch) return startsWithMatch;

            // 2. Account number contains hint
            const numberMatch = allAccounts.find(a =>
                a.accountNumber?.toLowerCase().includes(hintLower)
            );
            if (numberMatch) return numberMatch;

            // 3. Bank name / app package contains hint
            const bankMatch = allAccounts.find(a =>
                a.bankName?.toLowerCase().includes(hintLower) ||
                a.appPackageName?.toLowerCase().includes(hintLower)
            );
            if (bankMatch) return bankMatch;

            // 4. Fallback: name contains hint (substring) — tapi hindari partial match ambigu
            //    e.g. 'dana' TIDAK boleh match 'Ciptadana'
            const substringMatch = allAccounts.find(a => {
                const nameLower = a.name?.toLowerCase() || '';
                // Cek apakah hint muncul sebagai kata terpisah, bukan bagian dari kata lain
                const regex = new RegExp(`\\b${hintLower.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
                return regex.test(nameLower);
            });
            if (substringMatch) return substringMatch;

            return null;
        };

        let sourceAccount = await findAccountByHint(parsed.sourceAccountHint);
        let destinationAccount = await findAccountByHint(parsed.destinationAccountHint);
        let account = await findAccountByHint(parsed.accountHint);

        if ((!account || (parsed.type === TransactionType.TRANSFER && !destinationAccount)) && appName) {
            const appShort = String(appName).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const sourceAppAccount = await findAccountByHint(appShort);
            account = account ?? sourceAppAccount;
            if (parsed.type === TransactionType.TRANSFER && !sourceAccount) {
                sourceAccount = sourceAppAccount;
            }
        }

        if (!account) {
            const { data: fallbackAccounts } = await supabase.from('Account').select('*').order('createdAt', { ascending: true }).limit(1);
            account = fallbackAccounts?.[0] || null;
        }

        if (parsed.type === TransactionType.INCOME) destinationAccount = destinationAccount ?? account;
        if (parsed.type === TransactionType.EXPENSE || parsed.type === TransactionType.INVESTMENT_OUT) sourceAccount = sourceAccount ?? account;

        const ownerId = sourceAccount?.ownerId ?? destinationAccount?.ownerId ?? account?.ownerId;
        if (ownerId && ownerId !== owner?.id) {
            const { data: realOwner } = await supabase.from('Owner').select('*').eq('id', ownerId).limit(1).single();
            if (realOwner) owner = realOwner;
        }

        let effectiveType = parsed.type;
        let sourceAccountId = parsed.type === TransactionType.TRANSFER
            ? sourceAccount?.id ?? null
            : parsed.type === TransactionType.EXPENSE || parsed.type === TransactionType.INVESTMENT_OUT
                ? sourceAccount?.id ?? account?.id ?? null
                : null;
        let destinationAccountId = parsed.type === TransactionType.TRANSFER
            ? destinationAccount?.id ?? null
            : parsed.type === TransactionType.INCOME
                ? destinationAccount?.id ?? account?.id ?? null
                : null;
        const normalizedNotificationText = normalizeText(`${title || senderName || ''} ${text}`);

        let missingAccountReason = (
            (effectiveType === TransactionType.TRANSFER && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId))
            || (effectiveType === TransactionType.INCOME && !destinationAccountId)
            || ((effectiveType === TransactionType.EXPENSE || effectiveType === TransactionType.INVESTMENT_OUT) && !sourceAccountId)
        )
            ? (effectiveType === TransactionType.TRANSFER ? 'Rekening transfer belum lengkap atau masih sama' : 'Rekening transaksi belum berhasil dipetakan')
            : null;

        if (effectiveType === TransactionType.TRANSFER && missingAccountReason) {
            const transferDirection = detectTransferDirection(normalizedNotificationText);
            const isTransferLikeTopUp = detectTransferLikeTopUp(String(appName), normalizedNotificationText);

            if (isTransferLikeTopUp) {
                const sourceAppHint = detectSourceAppHint(String(appName));
                const sourceAppLooksLikeEWallet = sourceAppHint ? E_WALLET_APPS.includes(sourceAppHint) : false;

                if (sourceAppLooksLikeEWallet) {
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
                || (effectiveType === TransactionType.TRANSFER && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId))
            )
                ? (effectiveType === TransactionType.TRANSFER ? 'Rekening transfer belum lengkap atau masih sama' : 'Rekening transaksi belum berhasil dipetakan')
                : null;
        }

        const isMissingCriticalFields = !owner || !activity || (!account && !sourceAccount && !destinationAccount) || missingAccountReason;

        if (isMissingCriticalFields) {
            await supabase.from('NotificationInbox').update({
                parseStatus: 'PENDING',
                parseNotes: missingAccountReason ?? 'Master owner/activity/account belum lengkap',
                updatedAt: new Date().toISOString()
            }).eq('id', notification.id);

            const { data: updatedNotif } = await supabase.from('NotificationInbox').select('*').eq('id', notification.id).single();

            if (missingAccountReason) {
                return res.status(202).json({ success: true, notification: updatedNotif, createdTransaction: false, reason: missingAccountReason });
            }
            if (!owner || !activity) {
                return res.status(202).json({ success: true, notification: updatedNotif, createdTransaction: false, reason: 'Master data (owner/activity) belum ada, silakan tambahkan terlebih dahulu' });
            }
        }

        if (effectiveType !== parsed.type) {
            await supabase.from('NotificationInbox').update({
                parseStatus: 'PARSED',
                parsedType: effectiveType,
                parseNotes: 'Transfer ambigu dicatat otomatis sebagai transaksi satu rekening',
                updatedAt: new Date().toISOString()
            }).eq('id', notification.id);

            if (effectiveType === TransactionType.INCOME) {
                sourceAccountId = null;
            }

            if (effectiveType === TransactionType.EXPENSE) {
                destinationAccountId = null;
            }
        }

        const txNow = new Date().toISOString();
        const { data: transaction, error: txError } = await supabase.from('Transaction').insert({
            id: crypto.randomUUID(),
            amount: parsed.amount,
            type: effectiveType,
            date: nowIso,
            description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
            ownerId: owner!.id,
            activityId: activity!.id,
            isValidated: true,
            notificationInboxId: notification.id,
            sourceAccountId: sourceAccountId || null,
            destinationAccountId: destinationAccountId || null,
            createdAt: txNow,
            updatedAt: txNow
        }).select().single();

        if (txError) {
            throw new Error(`Gagal menyimpan transaksi: ${txError.message}`);
        }

        // Balance Sync: specific to accounts involved to avoid full table scan
        const accountIdsToSync = [sourceAccountId, destinationAccountId].filter(Boolean);
        if (accountIdsToSync.length > 0) {
            for (const accId of accountIdsToSync) {
                const { data: validTxs } = await supabase.from('Transaction').select('type, amount, sourceAccountId, destinationAccountId').eq('isValidated', true).or(`sourceAccountId.eq.${accId},destinationAccountId.eq.${accId}`);
                
                let balance = 0;
                if (validTxs) {
                    for (const tx of validTxs) {
                        const amount = Number(tx.amount || 0);
                        if (
                            (tx.type === TransactionType.INCOME || tx.type === TransactionType.INVESTMENT_IN) && tx.destinationAccountId === accId
                        ) {
                            balance += amount;
                        }
                        if (
                            (tx.type === TransactionType.EXPENSE || tx.type === TransactionType.INVESTMENT_OUT) && tx.sourceAccountId === accId
                        ) {
                            balance -= amount;
                        }
                        if (tx.type === TransactionType.TRANSFER) {
                            if (tx.sourceAccountId === accId) balance -= amount;
                            if (tx.destinationAccountId === accId) balance += amount;
                        }
                    }
                }
                
                await supabase.from('Account').update({ balance, updatedAt: new Date().toISOString() }).eq('id', accId);
            }
        }

        res.status(201).json({
            success: true,
            notification,
            transaction,
            createdTransaction: true
        });

    } catch (error: any) {
        console.error('[Webhook Error]:', error);
        const detailMessage = String(error?.message || error);
        const schemaHint = detailMessage.includes('new row violates row-level security policy')
            ? 'Webhook Vercel harus memakai SUPABASE_SERVICE_ROLE_KEY karena tabel memakai RLS authenticated-only.'
            : undefined;
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: detailMessage,
            hint: schemaHint
        });
    }
}
