import express from 'express';
import { PrismaClient, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeTransactionType } from '../lib/transactionRules.js';

const router = express.Router();
const notificationInboxClient = (prisma as PrismaClient & { notificationInbox: any }).notificationInbox;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALLOWED_CHAT_IDS_RAW = process.env.TELEGRAM_ALLOWED_CHAT_IDS || '';
// Comma-separated list of allowed Telegram chat/user IDs (leave empty to allow all)
const ALLOWED_CHAT_IDS = ALLOWED_CHAT_IDS_RAW
    ? ALLOWED_CHAT_IDS_RAW.split(',').map((s) => s.trim())
    : [];

// ─── Helpers ────────────────────────────────────────────────────────────────

const sendTelegramMessage = async (chatId: number | string, text: string) => {
    if (!BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    });
};

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

const ACCOUNT_HINTS = ['bca', 'bni', 'bri', 'mandiri', 'seabank', 'jago', 'blu', 'dana', 'gopay', 'ovo', 'shopeepay', 'flip'];
const INCOME_KEYWORDS  = ['masuk', 'menerima', 'diterima', 'transfer masuk', 'cashback', 'gaji', 'income', 'pemasukan'];
const EXPENSE_KEYWORDS = ['keluar', 'bayar', 'membayar', 'pembayaran', 'dana keluar', 'debit', 'beli', 'makan', 'belanja', 'expense', 'pengeluaran'];
const TRANSFER_KEYWORDS = ['transfer', 'pindah', 'kirim', 'tf'];
const TOP_UP_KEYWORDS = ['top up', 'topup', 'isi saldo', 'pengisian saldo'];
const INVESTMENT_KEYWORDS = ['investasi', 'reksa', 'saham', 'stockbit', 'bibit', 'invest'];

const normalizeText = (v: string) => v.toLowerCase().trim();

const extractAmount = (text: string) => {
    const candidates = [
        text.match(/rp\s*([\d.,]+)/i),
        text.match(/\b(\d{1,3}(?:[.,]\d{3})+)\b/),
        text.match(/\b(\d{5,})\b/),
    ];
    for (const match of candidates) {
        const raw = match?.[1];
        if (!raw) continue;
        const amount = Number(raw.replace(/[.,]/g, ''));
        if (Number.isFinite(amount) && amount > 0) return amount;
    }
    return null;
};

const detectAccountHint = (text: string) => {
    const lower = normalizeText(text);
    return ACCOUNT_HINTS.find((h) => lower.includes(h)) ?? null;
};

type ParsedTx = {
    amount: number | null;
    type: TransactionType | null;
    description: string;
    accountHint: string | null;
    confidence: number;
    status: 'PARSED' | 'PENDING' | 'IGNORED' | 'FAILED';
    notes: string;
};

/**
 * Parse a free-form Telegram message into a transaction candidate.
 * Format the user is expected to send:
 *   <keyword> <nominal> [rekening] [keterangan]
 *   e.g. "out 50000 gopay makan siang"
 *        "masuk 2.500.000 bri gaji april"
 */
const parseTelegramMessage = (text: string): ParsedTx => {
    const lower = normalizeText(text);
    const amount = extractAmount(text);
    const accountHint = detectAccountHint(text);
    let type: TransactionType | null = null;
    let confidence = 0.2;

    if (TOP_UP_KEYWORDS.some((k) => lower.includes(k))) {
        type = TransactionType.TRANSFER;
        confidence = 0.86;
    } else if (INVESTMENT_KEYWORDS.some((k) => lower.includes(k))) {
        type = TransactionType.TRANSFER;
        confidence = 0.85;
    } else if (INCOME_KEYWORDS.some((k) => lower.includes(k))) {
        type = TransactionType.INCOME;
        confidence = 0.88;
    } else if (EXPENSE_KEYWORDS.some((k) => lower.includes(k))) {
        type = TransactionType.EXPENSE;
        confidence = 0.85;
    } else if (TRANSFER_KEYWORDS.some((k) => lower.includes(k))) {
        type = TransactionType.TRANSFER;
        confidence = 0.75;
    }

    if (!amount) return { amount, type, description: text.slice(0, 160), accountHint, confidence: 0.1, status: 'IGNORED', notes: 'Nominal tidak ditemukan' };
    if (!type)   return { amount, type, description: text.slice(0, 160), accountHint, confidence: 0.4,  status: 'PENDING', notes: 'Jenis transaksi tidak dikenali, perlu tinjauan manual' };

    return {
        amount,
        type,
        description: text.trim().slice(0, 160),
        accountHint,
        confidence,
        status: confidence >= 0.75 ? 'PARSED' : 'PENDING',
        notes: confidence >= 0.75 ? 'Berhasil dikenali otomatis' : 'Perlu konfirmasi',
    };
};

const ensureDefaults = async (accountHint?: string | null) => {
    let owner = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!owner) owner = await prisma.owner.create({ data: { name: 'Owner Utama' } });

    let activity = await prisma.activity.findFirst({ where: { name: 'Lainnya' } });
    if (!activity) activity = await prisma.activity.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!activity) activity = await prisma.activity.create({ data: { name: 'Lainnya' } });

    let account = null;
    if (accountHint) {
        account = await prisma.account.findFirst({
            where: { OR: [{ name: { contains: accountHint, mode: 'insensitive' } }, { type: { contains: accountHint, mode: 'insensitive' } }] },
            orderBy: { createdAt: 'asc' },
        });
    }
    if (!account) account = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });

    return { owner, activity, account };
};

// ─── Help message ───────────────────────────────────────────────────────────

const HELP_TEXT = `
🤖 *NOVA Bot*

Kirim pesan dengan format:
\`<jenis> <nominal> [rekening] [keterangan]\`

*Jenis yang dikenali:*
• Pemasukan: \`masuk\`, \`gaji\`, \`income\`
• Pengeluaran: \`keluar\`, \`bayar\`, \`beli\`, \`makan\`, \`belanja\`
• Transfer: \`transfer\`, \`tf\`, \`kirim\`
• Top up: \`top up\`, \`topup\`, \`isi saldo\`
• Investasi: \`investasi\`, \`saham\`

*Contoh:*
\`makan siang 50000 gopay\`
\`gaji 5000000 bca april\`
\`transfer 500000 ke bni\`

*Perintah:*
/help — Tampilkan panduan ini
/saldo — Cek total saldo semua rekening
/transaksi — 5 transaksi terakhir
`;

// ─── Route: Register webhook URL to Telegram ────────────────────────────────

router.post('/setup', async (req, res) => {
    try {
        if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
        const webhookUrl = req.body.webhookUrl as string;
        if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl diperlukan' });

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
        });
        const data = await response.json() as any;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Gagal setup webhook' });
    }
});

// ─── Route: Receive updates from Telegram ───────────────────────────────────

router.post('/webhook', async (req, res) => {
    // Always respond 200 immediately so Telegram doesn't retry
    res.sendStatus(200);

    const update = req.body;
    const message = update?.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const userId = String(message.from?.id ?? chatId);
    const text: string = message.text.trim();
    const firstName = message.from?.first_name ?? 'Kawan';

    // Check whitelist
    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(userId) && !ALLOWED_CHAT_IDS.includes(String(chatId))) {
        await sendTelegramMessage(chatId, '⛔ Maaf, akses tidak diizinkan.');
        return;
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    if (text === '/start') {
        await sendTelegramMessage(chatId, `👋 Halo *${firstName}*!\n\nSelamat datang di *NOVA Bot*.\n\nKirim /help untuk panduan penggunaan.`);
        return;
    }

    if (text === '/help') {
        await sendTelegramMessage(chatId, HELP_TEXT);
        return;
    }

    if (text === '/saldo') {
        const accounts = await prisma.account.findMany({ include: { owner: true }, orderBy: { balance: 'desc' } });
        if (accounts.length === 0) {
            await sendTelegramMessage(chatId, '📭 Belum ada rekening terdaftar.');
            return;
        }
        const total = accounts.reduce((s, a) => s + a.balance, 0);
        const lines = accounts.map((a) => `• *${a.name}* (${a.owner.name}): ${formatCurrency(a.balance)}`).join('\n');
        await sendTelegramMessage(chatId, `💰 *Saldo Semua Rekening*\n\n${lines}\n\n*Total: ${formatCurrency(total)}*`);
        return;
    }

    if (text === '/transaksi') {
        const txs = await prisma.transaction.findMany({
            take: 5,
            orderBy: { date: 'desc' },
            include: { activity: true, owner: true },
        });
        if (txs.length === 0) {
            await sendTelegramMessage(chatId, '📭 Belum ada transaksi.');
            return;
        }
        const typeEmoji: Record<string, string> = { INCOME: '🟢', EXPENSE: '🔴', TRANSFER: '🔵' };
        const lines = txs.map((tx) => {
            const d = new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            return `${typeEmoji[normalizeTransactionType(tx.type)] ?? '⚪'} ${d} — *${formatCurrency(tx.amount)}* (${tx.activity.name})`;
        }).join('\n');
        await sendTelegramMessage(chatId, `📋 *5 Transaksi Terakhir*\n\n${lines}`);
        return;
    }

    // ── Free-form transaction message ─────────────────────────────────────────

    const parsed = parseTelegramMessage(text);

    // Save to notification inbox
    const notification = await notificationInboxClient.create({
        data: {
            sourceApp: 'Telegram',
            senderName: firstName,
            title: `Telegram: ${firstName}`,
            messageText: text,
            receivedAt: new Date(),
            parseStatus: parsed.status,
            parsedType: parsed.type ?? undefined,
            parsedAmount: parsed.amount ?? undefined,
            parsedDescription: parsed.description,
            parsedAccountHint: parsed.accountHint ?? undefined,
            confidenceScore: parsed.confidence,
            parseNotes: parsed.notes,
            rawPayload: update,
        },
    });

    // If not auto-parseable, send feedback and stop
    if (parsed.status !== 'PARSED' || !parsed.amount || !parsed.type) {
        const detail = parsed.status === 'IGNORED'
            ? '❓ Nominal tidak ditemukan. Sertakan angka, contoh: `makan 50000`.'
            : `⏳ Pesan masuk ke *Inbox* untuk ditinjau manual.\n_Catatan: ${parsed.notes}_`;
        await sendTelegramMessage(chatId, detail);
        return;
    }

    if (parsed.type === TransactionType.TRANSFER) {
        await sendTelegramMessage(chatId, '⏳ Transfer atau investasi dikenali, tapi dimasukkan ke Inbox dulu agar rekening sumber dan tujuan bisa dipilih dengan benar.');
        return;
    }

    // Create transaction
    const { owner, activity, account } = await ensureDefaults(parsed.accountHint);

    if (!owner || !activity || !account) {
        await sendTelegramMessage(chatId, '⚠️ Master data (owner/activity/rekening) belum lengkap. Silakan setup lewat aplikasi dulu.');
        return;
    }

    const transaction = await prisma.transaction.create({
        data: {
            amount: parsed.amount,
            type: parsed.type,
            date: new Date(),
            description: `[TG] ${parsed.description}`.slice(0, 190),
            ownerId: owner.id,
            activityId: activity.id,
            notificationInboxId: notification.id,
            isValidated: false,
            ...(parsed.type === TransactionType.INCOME
                ? { destinationAccountId: account.id }
                : { sourceAccountId: account.id }),
        },
    });

    const typeLabel: Record<string, string> = {
        INCOME: '💚 Pemasukan',
        EXPENSE: '❤️ Pengeluaran',
        TRANSFER: '💙 Transfer'
    };

    const replyText = [
        `✅ *Transaksi berhasil dicatat!*`,
        ``,
        `📌 Jenis: ${typeLabel[normalizeTransactionType(transaction.type)] ?? normalizeTransactionType(transaction.type)}`,
        `💰 Nominal: *${formatCurrency(transaction.amount)}*`,
        `🏦 Rekening: ${account.name}`,
        `👤 Pemilik: ${owner.name}`,
        `📝 Catatan: ${parsed.description}`,
        ``,
        `_Status: Menunggu validasi di aplikasi_`,
    ].join('\n');

    await sendTelegramMessage(chatId, replyText);
});

export default router;
