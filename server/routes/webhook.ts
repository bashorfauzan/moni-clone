import express from 'express';
import { TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

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

const ACCOUNT_HINTS = ['bca', 'bni', 'bri', 'brimo', 'mandiri', 'livin', 'seabank', 'jago', 'blu', 'bsi', 'btpn', 'jenius', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip', 'ovo', 'dana', 'paypal'];
const INCOME_KEYWORDS = ['masuk', 'menerima', 'diterima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'kredit', 'cr ', 'top up berhasil', 'berhasil top up', 'setor tunai', 'penerimaan', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'transfer keluar', 'debit', 'db ', 'dr ', 'transaksi berhasil', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya', 'biaya admin', 'biaya layanan', 'fee'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'pengiriman'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'ipo', 'ajaib', 'rhb', 'philip', 'sinarmas sekuritas', 'ciptadana'];
const E_WALLET_APPS = ['dana', 'gopay', 'ovo', 'shopeepay', 'flip'];
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
    return ACCOUNT_HINTS.find((hint) => lower.includes(hint)) ?? null;
};

const detectTransferLikeTopUp = (sourceApp: string, text: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    const mentionsTopUp = text.includes('top up') || text.includes('topup') || text.includes('pengisian saldo') || text.includes('isi saldo');
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

const detectSourceAppHint = (sourceApp: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    return ACCOUNT_HINTS.find((hint) => lowerSourceApp.includes(hint)) ?? null;
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

const resolveAccountHints = (
    type: TransactionType | null,
    sourceApp: string,
    text: string,
    fallbackHint: string | null
) => {
    const sourceAppHint = detectSourceAppHint(sourceApp);
    const hintFromSourcePhrase = detectHintAfterAnchors(text, ['dari ', 'via ', 'dr ']);
    const hintFromDestinationPhrase = detectHintAfterAnchors(text, ['ke rekening ', 'ke ', 'tujuan ']);

    let sourceAccountHint: string | null = null;
    let destinationAccountHint: string | null = null;

    if (type === TransactionType.TRANSFER) {
        sourceAccountHint = hintFromSourcePhrase
            ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
        destinationAccountHint = hintFromDestinationPhrase ?? sourceAppHint;
    } else if (type === TransactionType.INCOME) {
        destinationAccountHint = hintFromDestinationPhrase ?? fallbackHint ?? sourceAppHint;
    } else if (type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT_OUT) {
        sourceAccountHint = hintFromSourcePhrase ?? fallbackHint ?? sourceAppHint;
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
    const amount = extractAmount(combined);
    const accountHint = detectAccountHint(combined);
    let type: TransactionType | null = null;
    let confidenceScore = 0.2;
    let parseStatus: ParseStatus = 'FAILED';
    let parseNotes: string | null = 'Format belum dikenali';

    if (INVESTMENT_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.INVESTMENT_OUT;
        confidenceScore = 0.82;
    } else if (detectFeeCharge(lowerText) || containsAny(lowerText, EXPENSE_KEYWORDS)) {
        type = TransactionType.EXPENSE;
        confidenceScore = lowerText.includes('dikenakan biaya') ? 0.88 : 0.8;
    } else if (detectTransferLikeTopUp(sourceApp, lowerText)) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.78;
    } else if (containsAny(lowerText, INCOME_KEYWORDS)) {
        type = TransactionType.INCOME;
        confidenceScore = 0.84;
    } else if (
        normalizeText(sourceApp).includes('flip')
        || containsAny(lowerText, TRANSFER_KEYWORDS)
    ) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.78;
    }

    if (!amount) {
        if (type) {
            // Notifikasi ini jelas adalah transaksi (punya tipe), tapi nominal disembunyikan oleh aplikasi asalnya
            parseStatus = 'FAILED';
            parseNotes = 'Nominal tidak ada di teks (Silakan buat manual)';
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

const findAccountByHint = async (hint?: string | null) => {
    if (!hint) return null;

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
    if ((!account || (parsed.type === TransactionType.TRANSFER && !destinationAccount)) && sourceApp) {
        const appShort = sourceApp.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const sourceAppAccount = await findAccountByHint(appShort);
        account = account ?? sourceAppAccount;

        if (parsed.type === TransactionType.TRANSFER && !destinationAccount) {
            destinationAccount = sourceAppAccount;
        }
    }

    if (!account) {
        account = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });
    }

    if (parsed.type === TransactionType.INCOME) {
        destinationAccount = destinationAccount ?? account;
    }

    if (parsed.type === TransactionType.EXPENSE || parsed.type === TransactionType.INVESTMENT_OUT) {
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

        const parsed = parseNotificationText(
            String(appName),
            String(title || senderName || ''),
            String(text)
        );

        // Cek apakah ini adalah peringatan keamanan (login gagal, aktivitas mencurigakan, dll)
        const isSecurityAlert = detectSecurityAlert(`${title || ''} ${text}`);

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
        // dengan nominal yang HAMPIR SAMA masuk dalam 5 menit terakhir?
        if (parsed.amount) {
            const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
            const duplicate = await prisma.notificationInbox.findFirst({
                where: {
                    sourceApp: String(appName),
                    parsedAmount: parsed.amount,
                    receivedAt: { gte: fiveMinsAgo },
                    parseStatus: { not: 'IGNORED' } // Hanya cek terhadap notif yg valid
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

        // Jika tidak ada amount atau type, hanya simpan ke inbox saja (tidak bisa buat transaksi)
        if (!parsed.amount || !parsed.type) {
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
        const sourceAccountId = parsed.type === TransactionType.TRANSFER
            ? sourceAccount?.id ?? null
            : parsed.type === TransactionType.EXPENSE || parsed.type === TransactionType.INVESTMENT_OUT
                ? sourceAccount?.id ?? account?.id ?? null
                : null;
        const destinationAccountId = parsed.type === TransactionType.TRANSFER
            ? destinationAccount?.id ?? null
            : parsed.type === TransactionType.INCOME
                ? destinationAccount?.id ?? account?.id ?? null
                : null;

        const missingAccountReason = (
            (parsed.type === TransactionType.TRANSFER && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId))
            || (parsed.type === TransactionType.INCOME && !destinationAccountId)
            || ((parsed.type === TransactionType.EXPENSE || parsed.type === TransactionType.INVESTMENT_OUT) && !sourceAccountId)
        )
            ? (
                parsed.type === TransactionType.TRANSFER
                    ? 'Rekening transfer belum lengkap atau masih sama'
                    : 'Rekening transaksi belum berhasil dipetakan'
            )
            : null;

        const isMissingCriticalFields = !owner || !activity || (!account && !sourceAccount && !destinationAccount) || missingAccountReason;

        // Perbarui saja parseStatus menjadi PENDING jika data kurang lengkap, tapi TETAP buat transaksinya.
        if (isMissingCriticalFields) {
            await prisma.notificationInbox.update({
                where: { id: notification.id },
                data: {
                    parseStatus: 'PENDING',
                    parseNotes: missingAccountReason ?? 'Master owner/activity/account belum lengkap'
                }
            });
        }

        // Buat transaksi langsung tervalidasi — sesuai request user ("langsung masuk, tidak perlu persetujuan")
        const transaction = await prisma.transaction.create({
            data: {
                amount: parsed.amount,
                type: parsed.type,
                date: notification.receivedAt,
                description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
                ownerId: owner.id,
                activityId: activity.id,
                isValidated: true,
                notificationInboxId: notification.id,
                ...(sourceAccountId ? { sourceAccountId } : {}),
                ...(destinationAccountId ? { destinationAccountId } : {})
            }
        });

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
