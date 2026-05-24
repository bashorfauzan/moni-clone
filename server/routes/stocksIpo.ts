import express from 'express';
import { IpoOrderStatus, StockTransactionSide, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeValidatedAccountBalances, syncAccountBalances } from '../lib/accountBalances.js';

const router = express.Router();

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];
const SHARES_PER_LOT = 100;

const toTicker = (value: unknown) => String(value || '').trim().toUpperCase();

const toDate = (value: unknown, fallback?: Date | null) => {
    if (!value) return fallback ?? null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseStatus = (value: unknown) => {
    if (typeof value !== 'string') return null;
    return Object.values(IpoOrderStatus).includes(value as IpoOrderStatus)
        ? (value as IpoOrderStatus)
        : null;
};

const ensureStockAccount = async (accountId: string) => {
    const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, type: true }
    });

    if (!account) throw new Error('Rekening IPO tidak ditemukan');
    if (!STOCK_ACCOUNT_TYPES.includes(account.type)) {
        throw new Error('Rekening IPO harus bertipe RDN atau Sekuritas');
    }

    return account;
};

const computeIpoOrderAmount = (lot: number, pricePerShare: number) =>
    lot * SHARES_PER_LOT * pricePerShare;

const computeReservedIpoCash = async (
    trx: Prisma.TransactionClient,
    accountId: string,
    excludeOrderId?: string
) => {
    const rows = await trx.ipoOrder.findMany({
        where: {
            accountId,
            status: IpoOrderStatus.PESAN,
            ...(excludeOrderId ? { id: { not: excludeOrderId } } : {})
        },
        select: {
            lotRequested: true,
            ipoPrice: true
        }
    });

    return rows.reduce((sum, row) => sum + computeIpoOrderAmount(row.lotRequested, row.ipoPrice), 0);
};

const ensureIpoFunds = async (
    trx: Prisma.TransactionClient,
    payload: Awaited<ReturnType<typeof validateOrderPayload>>,
    orderId?: string
) => {
    if (payload.status === IpoOrderStatus.TIDAK_JATAH) return;

    const reservedCash = await computeReservedIpoCash(trx, payload.accountId, orderId);
    const balanceMap = await computeValidatedAccountBalances(trx);
    const availableBalance = Number(balanceMap.get(payload.accountId) || 0) - reservedCash;
    const requiredCash = payload.status === IpoOrderStatus.PESAN
        ? computeIpoOrderAmount(payload.lotRequested, payload.ipoPrice)
        : computeIpoOrderAmount(payload.lotAllocated, payload.ipoPrice);

    if (availableBalance < requiredCash) {
        throw new Error(
            `Saldo rekening IPO tidak cukup ` +
            `(tersedia Rp ${new Intl.NumberFormat('id-ID').format(availableBalance)}, butuh Rp ${new Intl.NumberFormat('id-ID').format(requiredCash)})`
        );
    }
};

const validateOrderPayload = async (body: any, existing?: any) => {
    const ownerId = String(body.ownerId ?? existing?.ownerId ?? '').trim();
    const accountId = String(body.accountId ?? existing?.accountId ?? '').trim();
    const ticker = toTicker(body.ticker ?? existing?.ticker);
    const broker = String(body.broker ?? existing?.broker ?? '').trim();
    const ipoPrice = Number(body.ipoPrice ?? existing?.ipoPrice);
    const lotRequested = Number(body.lotRequested ?? existing?.lotRequested);
    const lotAllocated = Number(body.lotAllocated ?? existing?.lotAllocated ?? 0);
    const sellPriceRaw = body.sellPrice ?? existing?.sellPrice;
    const sellPrice = sellPriceRaw === null || sellPriceRaw === undefined || sellPriceRaw === ''
        ? null
        : Number(sellPriceRaw);
    const status = parseStatus(body.status ?? existing?.status);
    const orderedAt = toDate(body.orderedAt ?? existing?.orderedAt);
    const allottedAt = toDate(body.allottedAt ?? existing?.allottedAt, null);
    const soldAt = toDate(body.soldAt ?? existing?.soldAt, null);
    const notes = body.notes !== undefined
        ? (body.notes ? String(body.notes).trim() : null)
        : (existing?.notes ?? null);

    if (!ownerId) throw new Error('Pemilik wajib dipilih');
    if (!accountId) throw new Error('Rekening IPO wajib dipilih');
    if (!ticker) throw new Error('Ticker IPO wajib diisi');
    if (!broker) throw new Error('Broker wajib diisi');
    if (!Number.isFinite(ipoPrice) || ipoPrice <= 0) throw new Error('Harga IPO harus lebih dari 0');
    if (!Number.isInteger(lotRequested) || lotRequested <= 0) throw new Error('Lot pesanan harus bilangan bulat lebih dari 0');
    if (!Number.isInteger(lotAllocated) || lotAllocated < 0) throw new Error('Lot jatah tidak valid');
    if (lotAllocated > lotRequested) throw new Error('Lot jatah tidak boleh lebih besar dari lot pesanan');
    if (!status) throw new Error('Status IPO tidak valid');
    if (!orderedAt) throw new Error('Tanggal pesanan IPO tidak valid');
    if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice <= 0)) throw new Error('Harga jual IPO tidak valid');
    if (status === IpoOrderStatus.JATAH && lotAllocated <= 0) throw new Error('Status JATAH membutuhkan lot jatah lebih dari 0');
    if (status === IpoOrderStatus.JUAL) {
        if (lotAllocated <= 0) throw new Error('Status JUAL membutuhkan lot jatah lebih dari 0');
        if (sellPrice === null) throw new Error('Harga jual wajib diisi untuk status JUAL');
        if (!soldAt) throw new Error('Tanggal jual wajib diisi untuk status JUAL');
    }

    if ((status === IpoOrderStatus.JATAH || status === IpoOrderStatus.JUAL) && !allottedAt) {
        throw new Error('Tanggal jatah wajib diisi untuk status JATAH atau JUAL');
    }

    await ensureStockAccount(accountId);

    return {
        ownerId,
        accountId,
        ticker,
        broker,
        ipoPrice,
        lotRequested,
        lotAllocated,
        sellPrice,
        status,
        notes,
        orderedAt,
        allottedAt,
        soldAt
    };
};

const syncIpoTransactions = async (
    trx: Prisma.TransactionClient,
    orderId: string,
    payload: Awaited<ReturnType<typeof validateOrderPayload>>
) => {
    await trx.ipoTransaction.deleteMany({
        where: { ipoOrderId: orderId }
    });

    if (payload.status === IpoOrderStatus.PESAN || payload.status === IpoOrderStatus.TIDAK_JATAH || payload.lotAllocated <= 0) {
        return;
    }

    const shares = payload.lotAllocated * SHARES_PER_LOT;
    const buyGrossValue = payload.ipoPrice * shares;

    await trx.ipoTransaction.create({
        data: {
            ipoOrderId: orderId,
            ownerId: payload.ownerId,
            accountId: payload.accountId,
            ticker: payload.ticker,
            side: StockTransactionSide.BUY,
            lot: payload.lotAllocated,
            pricePerShare: payload.ipoPrice,
            grossValue: buyGrossValue,
            feePercent: 0,
            feeAmount: 0,
            netValue: buyGrossValue,
            tradedAt: payload.allottedAt || payload.orderedAt
        }
    });

    if (payload.status !== IpoOrderStatus.JUAL || !payload.sellPrice) {
        return;
    }

    const sellGrossValue = payload.sellPrice * shares;

    await trx.ipoTransaction.create({
        data: {
            ipoOrderId: orderId,
            ownerId: payload.ownerId,
            accountId: payload.accountId,
            ticker: payload.ticker,
            side: StockTransactionSide.SELL,
            lot: payload.lotAllocated,
            pricePerShare: payload.sellPrice,
            grossValue: sellGrossValue,
            feePercent: 0,
            feeAmount: 0,
            netValue: sellGrossValue,
            tradedAt: payload.soldAt || payload.allottedAt || payload.orderedAt
        }
    });
};

router.get('/orders', async (req, res) => {
    try {
        const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
        const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
        const status = parseStatus(req.query.status);
        const ticker = typeof req.query.ticker === 'string' ? toTicker(req.query.ticker) : undefined;

        const rows = await prisma.ipoOrder.findMany({
            where: {
                ...(ownerId ? { ownerId } : {}),
                ...(accountId ? { accountId } : {}),
                ...(status ? { status } : {}),
                ...(ticker ? { ticker } : {})
            },
            include: {
                owner: true,
                account: true,
                transactions: {
                    orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }]
                }
            },
            orderBy: [{ orderedAt: 'desc' }, { createdAt: 'desc' }]
        });

        res.json(rows);
    } catch (error) {
        console.error('Get IPO orders error:', error);
        res.status(500).json({ error: 'Gagal mengambil data IPO' });
    }
});

router.post('/orders', async (req, res) => {
    try {
        const payload = await validateOrderPayload(req.body);

        const created = await prisma.$transaction(async (trx) => {
            await ensureIpoFunds(trx, payload);

            const order = await trx.ipoOrder.create({
                data: payload
            });

            await syncIpoTransactions(trx, order.id, payload);

            return trx.ipoOrder.findUniqueOrThrow({
                where: { id: order.id },
                include: {
                    owner: true,
                    account: true,
                    transactions: {
                        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }]
                    }
                }
            });
        });

        await syncAccountBalances(prisma);

        res.status(201).json(created);
    } catch (error) {
        console.error('Create IPO order error:', error);
        const message = error instanceof Error ? error.message : 'Gagal membuat order IPO';
        res.status(400).json({ error: message });
    }
});

router.patch('/orders/:id', async (req, res) => {
    try {
        const existing = await prisma.ipoOrder.findUnique({
            where: { id: req.params.id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Order IPO tidak ditemukan' });
        }

        const payload = await validateOrderPayload(req.body, existing);

        const updated = await prisma.$transaction(async (trx) => {
            await ensureIpoFunds(trx, payload, req.params.id);

            await trx.ipoOrder.update({
                where: { id: req.params.id },
                data: payload
            });

            await syncIpoTransactions(trx, req.params.id, payload);

            return trx.ipoOrder.findUniqueOrThrow({
                where: { id: req.params.id },
                include: {
                    owner: true,
                    account: true,
                    transactions: {
                        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }]
                    }
                }
            });
        });

        await syncAccountBalances(prisma);

        res.json(updated);
    } catch (error) {
        console.error('Update IPO order error:', error);
        const message = error instanceof Error ? error.message : 'Gagal mengubah order IPO';
        res.status(400).json({ error: message });
    }
});

router.delete('/orders/:id', async (req, res) => {
    try {
        await prisma.ipoOrder.delete({
            where: { id: req.params.id }
        });

        await syncAccountBalances(prisma);

        res.json({ message: 'Order IPO berhasil dihapus' });
    } catch (error) {
        console.error('Delete IPO order error:', error);
        res.status(400).json({ error: 'Gagal menghapus order IPO' });
    }
});

router.get('/transactions', async (req, res) => {
    try {
        const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
        const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
        const ticker = typeof req.query.ticker === 'string' ? toTicker(req.query.ticker) : undefined;

        const rows = await prisma.ipoTransaction.findMany({
            where: {
                ...(ownerId ? { ownerId } : {}),
                ...(accountId ? { accountId } : {}),
                ...(ticker ? { ticker } : {})
            },
            include: {
                owner: true,
                account: true,
                ipoOrder: true
            },
            orderBy: [{ tradedAt: 'desc' }, { createdAt: 'desc' }]
        });

        res.json(rows);
    } catch (error) {
        console.error('Get IPO transactions error:', error);
        res.status(500).json({ error: 'Gagal mengambil histori transaksi IPO' });
    }
});

export default router;
