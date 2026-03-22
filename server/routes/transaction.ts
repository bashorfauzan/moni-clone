import express from 'express';
import { Prisma, PrismaClient, TransactionType } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const MANUAL_INVESTMENT_TYPE = 'INVESTMENT';

const normalizeTransactionType = (type: unknown): TransactionType | null => {
    if (type === MANUAL_INVESTMENT_TYPE) return TransactionType.INVESTMENT_OUT;
    if (typeof type !== 'string') return null;

    const allowedTypes = Object.values(TransactionType) as string[];
    return allowedTypes.includes(type) ? (type as TransactionType) : null;
};

const shouldReduceTargets = (type: TransactionType) => (
    type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT_OUT
);

const INVESTMENT_INCOME_ACTIVITY = {
    SUKUK: 'Pendapatan Sukuk',
    STOCK_GROWTH: 'Pertumbuhan Saham'
} as const;

const DEFAULT_ACTIVITY_BY_TYPE: Record<TransactionType, string> = {
    INCOME: 'Pemasukan',
    EXPENSE: 'Pengeluaran',
    TRANSFER: 'Transfer',
    INVESTMENT_IN: 'Investasi Masuk',
    INVESTMENT_OUT: 'Investasi Keluar'
};

const ensureActivityByName = async (trx: Prisma.TransactionClient, name: string) => {
    const existing = await trx.activity.findFirst({
        where: { name }
    });

    if (existing) return existing;

    return trx.activity.create({
        data: { name }
    });
};

const applyAccountBalanceChanges = async (
    trx: Prisma.TransactionClient,
    type: TransactionType,
    amount: number,
    sourceAccountId?: string | null,
    destinationAccountId?: string | null
) => {
    if (type === TransactionType.INCOME && destinationAccountId) {
        await trx.account.update({
            where: { id: destinationAccountId },
            data: { balance: { increment: amount } }
        });
        return;
    }

    if ((type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT_OUT) && sourceAccountId) {
        await trx.account.update({
            where: { id: sourceAccountId },
            data: { balance: { decrement: amount } }
        });
        return;
    }

    if (type === TransactionType.TRANSFER && sourceAccountId && destinationAccountId) {
        await trx.account.update({
            where: { id: sourceAccountId },
            data: { balance: { decrement: amount } }
        });
        await trx.account.update({
            where: { id: destinationAccountId },
            data: { balance: { increment: amount } }
        });
    }
};

const reduceActiveTargets = async (
    trx: Prisma.TransactionClient,
    ownerId: string,
    amount: number
) => {
    if (amount <= 0) return;

    const activeTargets = await trx.target.findMany({
        where: { ownerId, isActive: true, remainingAmount: { gt: 0 } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }]
    });

    let remainingReduction = amount;

    for (const target of activeTargets) {
        if (remainingReduction <= 0) break;

        const nextRemaining = Math.max(0, target.remainingAmount - remainingReduction);
        const reducedAmount = target.remainingAmount - nextRemaining;

        await trx.target.update({
            where: { id: target.id },
            data: {
                remainingAmount: nextRemaining,
                isActive: nextRemaining > 0
            }
        });

        remainingReduction -= reducedAmount;
    }
};

const ensureSourceAccountHasFunds = async (
    trx: Prisma.TransactionClient,
    type: TransactionType,
    amount: number,
    sourceAccountId?: string
) => {
    const requiresSourceBalance = type === TransactionType.EXPENSE
        || type === TransactionType.INVESTMENT_OUT
        || type === TransactionType.TRANSFER;

    if (!requiresSourceBalance || !sourceAccountId) return null;

    const sourceAccount = await trx.account.findUnique({
        where: { id: sourceAccountId },
        select: { balance: true }
    });

    if (!sourceAccount) {
        return 'Rekening sumber tidak ditemukan';
    }

    if (sourceAccount.balance < amount) {
        return 'Saldo rekening sumber tidak cukup';
    }

    return null;
};

const validateTransactionPayload = ({
    type,
    amount,
    ownerId,
    sourceAccountId,
    destinationAccountId
}: {
    type: TransactionType;
    amount: number;
    ownerId?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
}) => {
    if (!Number.isFinite(amount) || amount <= 0) {
        return 'Jumlah transaksi harus lebih dari 0';
    }

    if (!ownerId) {
        return 'Pemilik wajib diisi';
    }

    if (type === TransactionType.INCOME && !destinationAccountId) {
        return 'Rekening tujuan wajib dipilih untuk pemasukan';
    }

    if ((type === TransactionType.EXPENSE || type === TransactionType.INVESTMENT_OUT) && !sourceAccountId) {
        return 'Rekening sumber wajib dipilih untuk pengeluaran';
    }

    if (type === TransactionType.TRANSFER) {
        if (!sourceAccountId || !destinationAccountId) {
            return 'Transfer harus memiliki rekening sumber dan tujuan';
        }
        if (sourceAccountId === destinationAccountId) {
            return 'Rekening sumber dan tujuan transfer tidak boleh sama';
        }
    }

    return null;
};

const resolveActivityId = async (
    trx: Prisma.TransactionClient,
    type: TransactionType,
    activityId?: string
) => {
    if (activityId) return activityId;

    const activity = await ensureActivityByName(trx, DEFAULT_ACTIVITY_BY_TYPE[type]);
    return activity.id;
};

// Ambil semua transaksi (Dashboard)
router.get('/', async (req, res) => {
    try {
        const limitParam = Number(req.query.limit);
        const validatedParam = req.query.validated;
        const where: {
            isValidated?: boolean;
            date?: { gte?: Date; lte?: Date };
        } = {};

        if (validatedParam === 'true') where.isValidated = true;
        if (validatedParam === 'false') where.isValidated = false;

        if (req.query.dateFrom || req.query.dateTo) {
            where.date = {};
            if (typeof req.query.dateFrom === 'string') {
                where.date.gte = new Date(req.query.dateFrom);
            }
            if (typeof req.query.dateTo === 'string') {
                where.date.lte = new Date(req.query.dateTo);
            }
        }

        const transactions = await prisma.transaction.findMany({
            where,
            include: {
                owner: true,
                activity: true,
                sourceAccount: true,
                destinationAccount: true,
            },
            orderBy: { date: 'desc' },
            ...(Number.isFinite(limitParam) && limitParam > 0 ? { take: limitParam } : {})
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data transaksi' });
    }
});

// Tambah transaksi baru
router.post('/', async (req, res) => {
    const {
        type, amount, description, ownerId, activityId,
        sourceAccountId, destinationAccountId, date
    } = req.body;

    try {
        const parsedAmount = Number(amount);
        const txType = normalizeTransactionType(type);

        if (!txType) {
            return res.status(400).json({ error: 'Jenis transaksi tidak valid' });
        }

        const payloadError = validateTransactionPayload({
            type: txType,
            amount: parsedAmount,
            ownerId,
            sourceAccountId,
            destinationAccountId
        });

        if (payloadError) {
            return res.status(400).json({ error: payloadError });
        }

        const transaction = await prisma.$transaction(async (trx) => {
            const sourceFundsError = await ensureSourceAccountHasFunds(
                trx,
                txType,
                parsedAmount,
                sourceAccountId
            );

            if (sourceFundsError) {
                throw new Error(sourceFundsError);
            }

            const resolvedActivityId = await resolveActivityId(trx, txType, activityId);
            const createdTx = await trx.transaction.create({
                data: {
                    type: txType,
                    amount: parsedAmount,
                    description,
                    ownerId,
                    activityId: resolvedActivityId,
                    isValidated: true,
                    sourceAccountId: sourceAccountId || undefined,
                    destinationAccountId: destinationAccountId || undefined,
                    date: date ? new Date(date) : new Date(),
                }
            });

            await applyAccountBalanceChanges(
                trx,
                txType,
                parsedAmount,
                sourceAccountId,
                destinationAccountId
            );

            if (shouldReduceTargets(txType)) {
                await reduceActiveTargets(trx, ownerId, parsedAmount);
            }

            return createdTx;
        });

        res.status(201).json(transaction);
        } catch (error) {
            console.error(error);
        const message = error instanceof Error ? error.message : 'Gagal membuat transaksi';
        res.status(400).json({ error: message });
    }
});

const createInvestmentIncomeTransaction = async ({
    amount,
    ownerId,
    destinationAccountId,
    description,
    date,
    kind
}: {
    amount: unknown;
    ownerId: unknown;
    destinationAccountId: unknown;
    description?: unknown;
    date?: unknown;
    kind: keyof typeof INVESTMENT_INCOME_ACTIVITY;
}) => {
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Jumlah pemasukan investasi harus lebih dari 0');
    }

    if (!ownerId || !destinationAccountId) {
        throw new Error('Pemilik dan rekening investasi wajib dipilih');
    }

    const destinationAccount = await prisma.account.findUnique({
        where: { id: String(destinationAccountId) }
    });

    if (!destinationAccount) {
        throw new Error('Rekening tujuan tidak ditemukan');
    }

    if (!['RDN', 'Sekuritas'].includes(destinationAccount.type)) {
        throw new Error('Pemasukan investasi hanya bisa dicatat ke rekening RDN atau Sekuritas');
    }

    const activityName = INVESTMENT_INCOME_ACTIVITY[kind];

    return prisma.$transaction(async (trx) => {
        const activity = await ensureActivityByName(trx, activityName);
        const createdTransaction = await trx.transaction.create({
            data: {
                type: TransactionType.INCOME,
                amount: parsedAmount,
                description: (description ? String(description) : activityName).slice(0, 190),
                ownerId: String(ownerId),
                activityId: activity.id,
                destinationAccountId: String(destinationAccountId),
                isValidated: true,
                date: date ? new Date(String(date)) : new Date()
            },
            include: {
                owner: true,
                activity: true,
                destinationAccount: true
            }
        });

        await applyAccountBalanceChanges(
            trx,
            TransactionType.INCOME,
            parsedAmount,
            undefined,
            String(destinationAccountId)
        );

        return createdTransaction;
    });
};

router.post('/investment-income', async (req, res) => {
    const { amount, ownerId, destinationAccountId, description, date, kind } = req.body;

    try {
        const normalizedKind = kind === 'STOCK_GROWTH' ? 'STOCK_GROWTH' : 'SUKUK';
        const transaction = await createInvestmentIncomeTransaction({
            amount,
            ownerId,
            destinationAccountId,
            description,
            date,
            kind: normalizedKind
        });

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Create investment income error:', error);
        const message = error instanceof Error ? error.message : 'Gagal mencatat pemasukan investasi';
        res.status(400).json({ error: message });
    }
});

router.post('/sukuk-income', async (req, res) => {
    const { amount, ownerId, destinationAccountId, description, date } = req.body;

    try {
        const transaction = await createInvestmentIncomeTransaction({
            amount,
            ownerId,
            destinationAccountId,
            description,
            date,
            kind: 'SUKUK'
        });

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Create sukuk income error:', error);
        const message = error instanceof Error ? error.message : 'Gagal mencatat pendapatan sukuk';
        res.status(400).json({ error: message });
    }
});

// Endpoint untuk Validasi (Approve/Reject) Webhook Transaksi Pending
router.put('/:id/validate', async (req, res) => {
    const { id } = req.params;
    const { action, sourceAccountId, destinationAccountId, categoryId, amount, type } = req.body; // action: 'APPROVE' | 'REJECT'

    try {
        if (action === 'REJECT') {
            await prisma.transaction.delete({ where: { id } });
            return res.json({ message: 'Transaksi ditolak dan ditiadakan' });
        }

        if (action === 'APPROVE') {
            const parsedAmount = Number(amount);
            const txType = normalizeTransactionType(type);

            if (!txType) {
                return res.status(400).json({ error: 'Jenis transaksi tidak valid' });
            }

            const currentTx = await prisma.transaction.findUnique({ where: { id } });
            if (!currentTx) {
                return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
            }

            const payloadError = validateTransactionPayload({
                type: txType,
                amount: parsedAmount,
                ownerId: currentTx.ownerId,
                sourceAccountId,
                destinationAccountId
            });

            if (payloadError) {
                return res.status(400).json({ error: payloadError });
            }

            // Jalankan transaksi DB untuk amankan proses update saldo
            const validatedTx = await prisma.$transaction(async (trx) => {
                const sourceFundsError = await ensureSourceAccountHasFunds(
                    trx,
                    txType,
                    parsedAmount,
                    sourceAccountId
                );

                if (sourceFundsError) {
                    throw new Error(sourceFundsError);
                }

                const resolvedActivityId = await resolveActivityId(trx, txType, categoryId || currentTx.activityId);
                // Update transaction menjadi tervalidasi dan dengan data final
                const updatedTx = await trx.transaction.update({
                    where: { id },
                    data: {
                        isValidated: true,
                        sourceAccountId: sourceAccountId || null,
                        destinationAccountId: destinationAccountId || null,
                        activityId: resolvedActivityId,
                        amount: parsedAmount,
                        type: txType
                    }
                });

                await applyAccountBalanceChanges(
                    trx,
                    txType,
                    parsedAmount,
                    sourceAccountId,
                    destinationAccountId
                );

                if (shouldReduceTargets(txType)) {
                    await reduceActiveTargets(trx, updatedTx.ownerId, parsedAmount);
                }

                return updatedTx;
            });

            return res.json(validatedTx);
        }

        res.status(400).json({ error: 'Action invalid' });
    } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Gagal memvalidasi transaksi';
        res.status(500).json({ error: message });
    }
});

// Endpoint untuk Master Data (Pendukung dropdown)
router.get('/meta', async (req, res) => {
    try {
        const [owners, accounts, activities] = await Promise.all([
            prisma.owner.findMany(),
            prisma.account.findMany(),
            prisma.activity.findMany()
        ]);
        res.json({ owners, accounts, activities });
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data meta' });
    }
});

export default router;
