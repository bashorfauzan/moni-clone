import { createClient } from '@supabase/supabase-js';

// Transation types hardcoded to avoid Prisma dependency
enum TransactionType {
    INCOME = 'INCOME',
    EXPENSE = 'EXPENSE',
    TRANSFER = 'TRANSFER',
    INVESTMENT_IN = 'INVESTMENT_IN',
    INVESTMENT_OUT = 'INVESTMENT_OUT'
}

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
const TRANSFER_OUT_KEYWORDS = ['dikirim', 'mengirim', 'kirim ke', 'transfer ke', 'pindah ke', 'ditransfer ke', 'pembayaran'];
const TRANSFER_IN_KEYWORDS = ['diterima', 'menerima', 'transfer masuk', 'dana masuk', 'masuk dari', 'ditransfer dari'];
const STRONG_INCOME_KEYWORDS = ['masuk', 'diterima', 'terima', 'transfer masuk', 'dana masuk', 'cashback', 'gaji', 'penerimaan', 'pemasukan', 'setor tunai'];
const STRONG_EXPENSE_KEYWORDS = ['bayar', 'membayar', 'briva', 'virtual account', 'tagihan', 'belanja', 'pembelian', 'tarik tunai', 'penarikan', 'biaya admin', 'biaya layanan'];
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

const shouldIgnoreRdnFinancialNote = (sourceApp: string, title: string, text: string) => {
    const lowerSourceApp = normalizeText(sourceApp);
    const lowerTitle = normalizeText(title);
    const lowerText = normalizeText(text);
    const isBcaFamily = lowerSourceApp.includes('bca') || lowerSourceApp.includes('mybca');
    const isFinancialNote = lowerTitle.includes('catatan finansial') || lowerText.includes('catatan finansial');
    return isBcaFamily && isFinancialNote && lowerText.includes('rdn');
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
    const hintFromDestinationPhrase = detectHintAfterAnchors(text, ['ke rekening ', 'ke ', 'tujuan ']);
    const transferDirection = detectTransferDirection(text);

    let sourceAccountHint: string | null = null;
    let destinationAccountHint: string | null = null;

    if (type === TransactionType.TRANSFER) {
        if (transferDirection === 'OUT') {
            sourceAccountHint = sourceAppHint ?? fallbackHint ?? hintFromSourcePhrase;
            destinationAccountHint = hintFromDestinationPhrase;
        } else if (transferDirection === 'IN') {
            sourceAccountHint = hintFromSourcePhrase;
            destinationAccountHint = sourceAppHint ?? fallbackHint ?? hintFromDestinationPhrase;
        } else {
            sourceAccountHint = hintFromSourcePhrase
                ?? sourceAppHint
                ?? (fallbackHint && fallbackHint !== sourceAppHint ? fallbackHint : null);
            destinationAccountHint = hintFromDestinationPhrase;
        }
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

    const amount = extractAmount(combined);
    const accountHint = detectAccountHint(combined);
    let type: TransactionType | null = null;
    let confidenceScore = 0.2;
    let parseStatus: ParseStatus = 'FAILED';
    let parseNotes: string | null = 'Format belum dikenali';

    if (INVESTMENT_KEYWORDS.some((keyword) => lowerText.includes(keyword))) {
        type = TransactionType.INVESTMENT_OUT;
        confidenceScore = 0.82;
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

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase credentials missing');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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

        const isSecurityAlert = detectSecurityAlert(`${title || ''} ${text}`);

        if (parsed.parseStatus === 'IGNORED' && !isSecurityAlert) {
            return res.status(200).json({
                message: 'Notifikasi diabaikan karena tidak mengandung nominal transaksi',
                parsed
            });
        }

        const nowIso = receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString();

        if (parsed.parseStatus === 'IGNORED' && isSecurityAlert) {
            const { data: securityNotification } = await supabase.from('NotificationInbox').insert({
                sourceApp: String(appName),
                senderName: senderName ? String(senderName) : null,
                title: title ? String(title) : null,
                messageText: String(text),
                receivedAt: nowIso,
                parseStatus: 'FAILED',
                parsedType: null,
                parsedAmount: null,
                parsedDescription: String(text).slice(0, 160),
                parsedAccountHint: null,
                confidenceScore: 0,
                parseNotes: '⚠️ Peringatan Keamanan: Aktivitas login mencurigakan terdeteksi',
                rawPayload: rawPayload ?? req.body
            }).select().single();

            return res.status(201).json({
                success: true,
                notification: securityNotification,
                createdTransaction: false,
                reason: 'security_alert'
            });
        }

        if (parsed.amount) {
            const oneMinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
            
            // Note: Cannot do simple eq/gte easily via ORM for all properties simultaneously if missing,
            // building the query dynamically:
            let duplicateQuery = supabase.from('NotificationInbox')
                .select('id')
                .eq('sourceApp', String(appName))
                .eq('parsedAmount', parsed.amount)
                .gte('receivedAt', oneMinAgo)
                .neq('parseStatus', 'IGNORED');
                
            if (parsed.type) duplicateQuery = duplicateQuery.eq('parsedType', parsed.type);

            const { data: duplicates } = await duplicateQuery.limit(1);

            if (duplicates && duplicates.length > 0) {
                return res.status(200).json({
                    message: `Notifikasi diabaikan karena dideteksi sebagai duplikat dari transaksi Rp${parsed.amount}`,
                    parsed,
                    isDuplicate: true,
                    duplicateOfId: duplicates[0].id
                });
            }
        }

        const { data: notification, error: notifError } = await supabase.from('NotificationInbox').insert({
            sourceApp: String(appName),
            senderName: senderName ? String(senderName) : null,
            title: title ? String(title) : null,
            messageText: String(text),
            receivedAt: nowIso,
            parseStatus: parsed.parseStatus,
            parsedType: parsed.type,
            parsedAmount: parsed.amount,
            parsedDescription: parsed.description,
            parsedAccountHint: parsed.accountHint,
            confidenceScore: parsed.confidenceScore,
            parseNotes: parsed.parseNotes,
            rawPayload: rawPayload ?? req.body
        }).select().single();

        if (notifError || !notification) {
            throw new Error(`Gagal menyimpan notifikasi: ${notifError?.message}`);
        }

        if (!parsed.amount || !parsed.type) {
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
            const { data: newOwner } = await supabase.from('Owner').insert({ name: 'Owner Utama' }).select().single();
            owner = newOwner;
        }

        const { data: activities } = await supabase.from('Activity').select('*').eq('name', 'Lainnya').limit(1);
        let activity = activities?.[0];
        if (!activity) {
            const { data: fallbackActivities } = await supabase.from('Activity').select('*').order('createdAt', { ascending: true }).limit(1);
            activity = fallbackActivities?.[0];
            if (!activity) {
                const { data: newActivity } = await supabase.from('Activity').insert({ name: 'Lainnya' }).select().single();
                activity = newActivity;
            }
        }

        const findAccountByHint = async (hint: string | null) => {
            if (!hint) return null;
            const { data } = await supabase.from('Account').select('*').or(`name.ilike.%${hint}%,type.ilike.%${hint}%,accountNumber.ilike.%${hint}%,appPackageName.ilike.%${hint}%`).order('createdAt', { ascending: true }).limit(1);
            return data?.[0] || null;
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
            ? (parsed.type === TransactionType.TRANSFER ? 'Rekening transfer belum lengkap atau masih sama' : 'Rekening transaksi belum berhasil dipetakan')
            : null;

        const isMissingCriticalFields = !owner || !activity || (!account && !sourceAccount && !destinationAccount) || missingAccountReason;

        if (isMissingCriticalFields) {
            await supabase.from('NotificationInbox').update({
                parseStatus: 'PENDING',
                parseNotes: missingAccountReason ?? 'Master owner/activity/account belum lengkap'
            }).eq('id', notification.id);

            const { data: updatedNotif } = await supabase.from('NotificationInbox').select('*').eq('id', notification.id).single();

            if (parsed.type === TransactionType.TRANSFER && missingAccountReason) {
                return res.status(202).json({ success: true, notification: updatedNotif, createdTransaction: false, reason: missingAccountReason });
            }
            if (!owner || !activity) {
                return res.status(202).json({ success: true, notification: updatedNotif, createdTransaction: false, reason: 'Master data (owner/activity) belum ada, silakan tambahkan terlebih dahulu' });
            }
        }

        const { data: transaction, error: txError } = await supabase.from('Transaction').insert({
            amount: parsed.amount,
            type: parsed.type,
            date: nowIso,
            description: `[Notif Auto] ${parsed.description}`.slice(0, 190),
            ownerId: owner!.id,
            activityId: activity!.id,
            isValidated: true,
            notificationInboxId: notification.id,
            sourceAccountId,
            destinationAccountId
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
                
                await supabase.from('Account').update({ balance }).eq('id', accId);
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
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: String(error?.message || error)
        });
    }
}
