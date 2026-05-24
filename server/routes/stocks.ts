import express from 'express';
import { StockTransactionSide, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeValidatedAccountBalances, syncAccountBalances } from '../lib/accountBalances.js';
import { calculateStockPositions } from '../lib/stockPositionCalculator.js';

const router = express.Router();

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];
const SHARES_PER_LOT = 100;

const toTicker = (value: unknown) => String(value || '').trim().toUpperCase();

const toDate = (value: unknown, fallback?: Date) => {
    if (!value) return fallback ?? null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseStockSide = (value: unknown) => {
    if (value === StockTransactionSide.BUY || value === StockTransactionSide.SELL) {
        return value;
    }

    return null;
};

const ensureStockAccount = async (accountId: string) => {
    const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: {
            id: true,
            type: true,
            name: true,
            stockBrokerFeePercent: true,
            stockLevyFeePercent: true
        }
    });

    if (!account) {
        throw new Error('Rekening saham tidak ditemukan');
    }

    if (!STOCK_ACCOUNT_TYPES.includes(account.type)) {
        throw new Error('Rekening saham harus bertipe RDN atau Sekuritas');
    }

    return account;
};

const buildTransactionValues = ({
    side,
    lot,
    pricePerShare,
    brokerFeePercent,
    levyFeePercent
}: {
    side: StockTransactionSide;
    lot: number;
    pricePerShare: number;
    brokerFeePercent: number;
    levyFeePercent: number;
}) => {
    const shares = lot * SHARES_PER_LOT;
    const grossValue = pricePerShare * shares;
    const brokerFee = grossValue * (brokerFeePercent / 100);
    const levyFee = grossValue * (levyFeePercent / 100);
    const totalFee = brokerFee + levyFee;
    const netValue = side === StockTransactionSide.BUY
        ? grossValue + totalFee
        : grossValue - totalFee;

    return {
        grossValue,
        netValue
    };
};

const getCashDelta = (side: StockTransactionSide, netValue: number) =>
    side === StockTransactionSide.BUY ? -netValue : netValue;

const ensureStockBuyFunds = async (
    trx: Prisma.TransactionClient,
    payload: {
        side: StockTransactionSide;
        accountId: string;
        netValue: number;
    },
    existing?: {
        side: StockTransactionSide;
        accountId: string;
        netValue: number;
    } | null
) => {
    if (payload.side !== StockTransactionSide.BUY) return;

    const balanceMap = await computeValidatedAccountBalances(trx);
    let availableBalance = Number(balanceMap.get(payload.accountId) || 0);

    if (existing) {
        availableBalance -= getCashDelta(existing.side, Number(existing.netValue || 0));
    }

    if (availableBalance < payload.netValue) {
        throw new Error(
            `Saldo rekening saham tidak cukup ` +
            `(tersedia Rp ${new Intl.NumberFormat('id-ID').format(availableBalance)})`
        );
    }
};

const validateStockPayload = async (body: any) => {
    const ownerId = String(body.ownerId || '').trim();
    const accountId = String(body.accountId || '').trim();
    const ticker = toTicker(body.ticker);
    const side = parseStockSide(body.side);
    const lot = Number(body.lot);
    const pricePerShare = Number(body.pricePerShare);
    const tradedAt = toDate(body.tradedAt);
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!ownerId) throw new Error('Pemilik wajib dipilih');
    if (!accountId) throw new Error('Rekening saham wajib dipilih');
    if (!ticker) throw new Error('Ticker saham wajib diisi');
    if (!side) throw new Error('Sisi transaksi harus BUY atau SELL');
    if (!Number.isInteger(lot) || lot <= 0) throw new Error('Lot harus bilangan bulat lebih dari 0');
    if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) throw new Error('Harga per lembar harus lebih dari 0');
    if (!tradedAt) throw new Error('Tanggal transaksi tidak valid');

    const account = await ensureStockAccount(accountId);
    const brokerFeePercent = Number(account.stockBrokerFeePercent || 0);
    const levyFeePercent = Number(account.stockLevyFeePercent || 0);

    return {
        ownerId,
        accountId,
        ticker,
        side,
        lot,
        pricePerShare,
        brokerFeePercent,
        levyFeePercent,
        tradedAt,
        notes
    };
};

router.get('/transactions', async (req, res) => {
    try {
        const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
        const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
        const ticker = typeof req.query.ticker === 'string' ? toTicker(req.query.ticker) : undefined;
        const dateFrom = typeof req.query.dateFrom === 'string' ? toDate(req.query.dateFrom) : null;
        const dateTo = typeof req.query.dateTo === 'string' ? toDate(req.query.dateTo) : null;

        const rows = await prisma.stockTransaction.findMany({
            where: {
                ...(ownerId ? { ownerId } : {}),
                ...(accountId ? { accountId } : {}),
                ...(ticker ? { ticker } : {}),
                ...((dateFrom || dateTo) ? {
                    tradedAt: {
                        ...(dateFrom ? { gte: dateFrom } : {}),
                        ...(dateTo ? { lte: dateTo } : {})
                    }
                } : {})
            },
            include: {
                owner: true,
                account: true
            },
            orderBy: [{ tradedAt: 'desc' }, { createdAt: 'desc' }]
        });

        res.json(rows);
    } catch (error) {
        console.error('Get stock transactions error:', error);
        res.status(500).json({ error: 'Gagal mengambil transaksi saham' });
    }
});

router.post('/transactions', async (req, res) => {
    try {
        const payload = await validateStockPayload(req.body);
        const values = buildTransactionValues(payload);

        const created = await prisma.$transaction(async (trx) => {
            await ensureStockBuyFunds(trx, {
                side: payload.side,
                accountId: payload.accountId,
                netValue: values.netValue
            });

            return trx.stockTransaction.create({
                data: {
                    ...payload,
                    ...values
                },
                include: {
                    owner: true,
                    account: true
                }
            });
        });

        await syncAccountBalances(prisma);

        res.status(201).json(created);
    } catch (error) {
        console.error('Create stock transaction error:', error);
        const message = error instanceof Error ? error.message : 'Gagal membuat transaksi saham';
        res.status(400).json({ error: message });
    }
});

router.patch('/transactions/:id', async (req, res) => {
    try {
        const existing = await prisma.stockTransaction.findUnique({
            where: { id: req.params.id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Transaksi saham tidak ditemukan' });
        }

        const payload = await validateStockPayload({
            ...existing,
            ...req.body
        });
        const values = buildTransactionValues(payload);

        const updated = await prisma.$transaction(async (trx) => {
            await ensureStockBuyFunds(
                trx,
                {
                    side: payload.side,
                    accountId: payload.accountId,
                    netValue: values.netValue
                },
                {
                    side: existing.side,
                    accountId: existing.accountId,
                    netValue: existing.netValue
                }
            );

            return trx.stockTransaction.update({
                where: { id: req.params.id },
                data: {
                    ...payload,
                    ...values
                },
                include: {
                    owner: true,
                    account: true
                }
            });
        });

        await syncAccountBalances(prisma);

        res.json(updated);
    } catch (error) {
        console.error('Update stock transaction error:', error);
        const message = error instanceof Error ? error.message : 'Gagal mengubah transaksi saham';
        res.status(400).json({ error: message });
    }
});

router.delete('/transactions/:id', async (req, res) => {
    try {
        await prisma.stockTransaction.delete({
            where: { id: req.params.id }
        });

        await syncAccountBalances(prisma);

        res.json({ message: 'Transaksi saham berhasil dihapus' });
    } catch (error) {
        console.error('Delete stock transaction error:', error);
        res.status(400).json({ error: 'Gagal menghapus transaksi saham' });
    }
});

router.get('/positions', async (req, res) => {
    try {
        const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
        const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
        const ticker = typeof req.query.ticker === 'string' ? toTicker(req.query.ticker) : undefined;
        const groupByAccount = req.query.groupByAccount === 'true';

        const [manualTransactions, ipoTransactions] = await Promise.all([
            prisma.stockTransaction.findMany({
                where: {
                    ...(ownerId ? { ownerId } : {}),
                    ...(accountId ? { accountId } : {}),
                    ...(ticker ? { ticker } : {})
                },
                orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }]
            }),
            prisma.ipoTransaction.findMany({
                where: {
                    ...(ownerId ? { ownerId } : {}),
                    ...(accountId ? { accountId } : {}),
                    ...(ticker ? { ticker } : {})
                },
                orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }]
            })
        ]);

        if (groupByAccount) {
            const accounts = await prisma.account.findMany({
                where: {
                    id: {
                        in: Array.from(new Set([
                            ...manualTransactions.map((row) => row.accountId),
                            ...ipoTransactions.map((row) => row.accountId)
                        ]))
                    }
                },
                select: { id: true, name: true }
            });
            const accountNameMap = new Map(accounts.map((row) => [row.id, row.name]));
            const groupedTransactions = new Map<string, Array<typeof manualTransactions[number] | typeof ipoTransactions[number]>>();

            for (const row of [...manualTransactions, ...ipoTransactions]) {
                const current = groupedTransactions.get(row.accountId) || [];
                current.push(row);
                groupedTransactions.set(row.accountId, current);
            }

            const groupedPositions = Array.from(groupedTransactions.entries()).flatMap(([currentAccountId, rows]) =>
                calculateStockPositions(rows).map((position) => ({
                    ...position,
                    accountId: currentAccountId,
                    accountName: accountNameMap.get(currentAccountId) || currentAccountId
                }))
            );

            return res.json(groupedPositions);
        }

        const positions = calculateStockPositions([
            ...manualTransactions,
            ...ipoTransactions
        ]);

        res.json(positions);
    } catch (error) {
        console.error('Get stock positions error:', error);
        res.status(500).json({ error: 'Gagal menghitung posisi saham' });
    }
});

export default router;
