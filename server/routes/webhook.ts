import express from 'express';
import { PrismaClient, TransactionType } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
// Removed hacky notificationInboxClient definition

type ParseStatus = 'PENDING' | 'PARSED' | 'IGNORED' | 'FAILED';

type ParsedNotification = {
    amount: number | null;
    type: TransactionType | null;
    description: string;
    accountHint: string | null;
    confidenceScore: number;
    parseStatus: ParseStatus;
    parseNotes: string | null;
};

const ACCOUNT_HINTS = ['bca', 'bni', 'bri', 'brimo', 'mandiri', 'livin', 'seabank', 'jago', 'blu', 'bsi', 'btpn', 'jenius', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip', 'ovo', 'dana', 'paypal'];
const INCOME_KEYWORDS = ['masuk', 'menerima', 'diterima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'kredit', 'cr ', 'top up berhasil', 'setor tunai', 'penerimaan', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'transfer keluar', 'debit', 'db ', 'dr ', 'transaksi berhasil', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'pengiriman'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'ipo', 'ajaib', 'rhb', 'philip', 'sinarmas sekuritas', 'ciptadana'];

const normalizeText = (value: string) => value.toLowerCase().trim();

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
    } else if (INCOME_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.INCOME;
        confidenceScore = 0.84;
    } else if (EXPENSE_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.EXPENSE;
        confidenceScore = 0.8;
    } else if (
        normalizeText(sourceApp).includes('flip')
        || TRANSFER_KEYWORDS.some((keyword) => lowerText.includes(keyword))
    ) {
        type = TransactionType.TRANSFER;
        confidenceScore = 0.72;
    }

    if (!amount) {
        parseStatus = 'IGNORED';
        parseNotes = 'Nominal tidak ditemukan';
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

    return {
        amount,
        type,
        description: text.trim().slice(0, 160),
        accountHint,
        confidenceScore,
        parseStatus,
        parseNotes
    };
};

const ensureDefaults = async (accountHint?: string | null, sourceApp?: string | null) => {
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

    let account = null;
    // Try matching by account hint first (text in notification)
    if (accountHint) {
        account = await prisma.account.findFirst({
            where: {
                OR: [
                    { name: { contains: accountHint, mode: 'insensitive' } },
                    { type: { contains: accountHint, mode: 'insensitive' } },
                    { accountNumber: { contains: accountHint, mode: 'insensitive' } }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    // If no match by hint, try matching by source app name (e.g. 'BRI', 'BCA')
    if (!account && sourceApp) {
        const appShort = sourceApp.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        account = await prisma.account.findFirst({
            where: { name: { contains: appShort, mode: 'insensitive' } },
            orderBy: { createdAt: 'asc' }
        });
    }

    if (!account) {
        account = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });
    }

    return { owner, activity, account };
};

router.get('/notifications', async (req, res) => {
    try {
        const limit = Number(req.query.limit);
        const parseStatus = typeof req.query.parseStatus === 'string'
            ? req.query.parseStatus
            : undefined;

        const notifications = await prisma.notificationInbox.findMany({
            where: parseStatus ? { parseStatus: parseStatus as ParseStatus } : undefined,
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

        const notification = await prisma.notificationInbox.create({
            data: {
                sourceApp: String(appName),
                senderName: senderName ? String(senderName) : undefined,
                title: title ? String(title) : undefined,
                messageText: String(text),
                receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
                parseStatus: parsed.parseStatus,
                parsedType: parsed.type ?? undefined,
                parsedAmount: parsed.amount ?? undefined,
                parsedDescription: parsed.description,
                parsedAccountHint: parsed.accountHint ?? undefined,
                confidenceScore: parsed.confidenceScore,
                parseNotes: parsed.parseNotes ?? undefined,
                rawPayload: rawPayload ?? req.body
            }
        });

        if (
            parsed.parseStatus !== 'PARSED'
            || !parsed.amount
            || !parsed.type
        ) {
            return res.status(202).json({
                success: true,
                notification,
                createdTransaction: false,
                reason: parsed.parseNotes
            });
        }

        const { owner, activity, account } = await ensureDefaults(parsed.accountHint, String(appName));
        if (!owner || !activity || !account) {
            await prisma.notificationInbox.update({
                where: { id: notification.id },
                data: {
                    parseStatus: 'PENDING',
                    parseNotes: 'Master owner/activity/account belum lengkap'
                }
            });

            return res.status(202).json({
                success: true,
                notification,
                createdTransaction: false,
                reason: 'Master data belum lengkap'
            });
        }

        const transaction = await prisma.transaction.create({
            data: {
                amount: parsed.amount,
                type: parsed.type,
                date: notification.receivedAt,
                description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
                ownerId: owner.id,
                activityId: activity.id,
                notificationInboxId: notification.id,
                ...(parsed.type === TransactionType.INCOME
                    ? { destinationAccountId: account.id }
                    : { sourceAccountId: account.id })
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
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error?.message,
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
        });
    }
});

export default router;
