import express from 'express';
import { StockTransactionSide, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { computeValidatedAccountBalances, syncAccountBalances } from '../lib/accountBalances.js';
import { calculateStockPositions } from '../lib/stockPositionCalculator.js';

const router = express.Router();

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];
const SHARES_PER_LOT = 100;
const STOCK_QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;
const STOCK_SYMBOL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StockQuotePayload = {
    ticker: string;
    symbol: string;
    price: number;
    asOf: string | null;
    currency: string;
    source: 'alpha-vantage';
};

const stockQuoteCache = new Map<string, { expiresAt: number; value: StockQuotePayload }>();
const stockSymbolCache = new Map<string, { expiresAt: number; value: string }>();

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

const getAlphaVantageApiKey = () =>
    process.env.ALPHA_VANTAGE_API_KEY?.trim()
    || process.env.ALPHA_VANTAGE_APIKEY?.trim()
    || '';

const readLiveCache = <T>(store: Map<string, { expiresAt: number; value: T }>, key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
    }

    return entry.value;
};

const writeLiveCache = <T>(
    store: Map<string, { expiresAt: number; value: T }>,
    key: string,
    value: T,
    ttlMs: number
) => {
    store.set(key, {
        expiresAt: Date.now() + ttlMs,
        value
    });
};

const fetchAlphaVantageJson = async (params: URLSearchParams) => {
    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, {
        headers: {
            accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Alpha Vantage error ${response.status}`);
    }

    return response.json();
};

const parseAlphaVantageQuote = (ticker: string, symbol: string, payload: any): StockQuotePayload | null => {
    const rawQuote = payload?.['Global Quote'];
    if (!rawQuote || typeof rawQuote !== 'object') return null;

    const price = Number(rawQuote['05. price'] || 0);
    if (!Number.isFinite(price) || price <= 0) return null;

    const latestTradingDay = String(rawQuote['07. latest trading day'] || '').trim();
    const asOf = latestTradingDay
        ? new Date(`${latestTradingDay}T00:00:00.000Z`).toISOString()
        : null;

    return {
        ticker,
        symbol,
        price,
        asOf,
        currency: 'IDR',
        source: 'alpha-vantage'
    };
};

const fetchAlphaVantageQuote = async (ticker: string, symbol: string, apiKey: string) => {
    const payload = await fetchAlphaVantageJson(new URLSearchParams({
        function: 'GLOBAL_QUOTE',
        symbol,
        apikey: apiKey
    }));

    return parseAlphaVantageQuote(ticker, symbol, payload);
};

const resolveAlphaVantageSymbol = async (ticker: string, apiKey: string) => {
    const cachedSymbol = readLiveCache(stockSymbolCache, ticker);
    if (cachedSymbol) return cachedSymbol;

    const payload = await fetchAlphaVantageJson(new URLSearchParams({
        function: 'SYMBOL_SEARCH',
        keywords: ticker,
        apikey: apiKey
    }));

    const matches = Array.isArray(payload?.bestMatches) ? payload.bestMatches : [];
    const normalizedTicker = ticker.toUpperCase();
    const normalizedMatches = matches
        .map((row: any) => ({
            symbol: String(row?.['1. symbol'] || '').trim(),
            region: String(row?.['4. region'] || '').trim().toLowerCase(),
            currency: String(row?.['8. currency'] || '').trim().toUpperCase()
        }))
        .filter((row: { symbol: string }) => Boolean(row.symbol));

    const preferredMatch = normalizedMatches.find((row: { symbol: string; region: string; currency: string }) =>
        (row.symbol.toUpperCase() === normalizedTicker || row.symbol.toUpperCase().startsWith(`${normalizedTicker}.`))
        && (row.currency === 'IDR' || row.region.includes('indonesia') || row.region.includes('jakarta'))
    ) || normalizedMatches.find((row: { symbol: string }) =>
        row.symbol.toUpperCase() === normalizedTicker || row.symbol.toUpperCase().startsWith(`${normalizedTicker}.`)
    ) || null;

    if (!preferredMatch?.symbol) {
        return null;
    }

    writeLiveCache(stockSymbolCache, ticker, preferredMatch.symbol, STOCK_SYMBOL_CACHE_TTL_MS);
    return preferredMatch.symbol;
};

const fetchLiveStockQuote = async (ticker: string, apiKey: string): Promise<StockQuotePayload | null> => {
    const activeTicker = toTicker(ticker);
    if (!activeTicker) return null;

    const cachedQuote = readLiveCache(stockQuoteCache, activeTicker);
    if (cachedQuote) return cachedQuote;

    const cachedSymbol = readLiveCache(stockSymbolCache, activeTicker);
    const candidateSymbols = Array.from(new Set([
        cachedSymbol,
        activeTicker,
        `${activeTicker}.JK`,
        `${activeTicker}.JKT`
    ].filter((value): value is string => Boolean(value))));

    for (const symbol of candidateSymbols) {
        try {
            const quote = await fetchAlphaVantageQuote(activeTicker, symbol, apiKey);
            if (quote) {
                writeLiveCache(stockSymbolCache, activeTicker, symbol, STOCK_SYMBOL_CACHE_TTL_MS);
                writeLiveCache(stockQuoteCache, activeTicker, quote, STOCK_QUOTE_CACHE_TTL_MS);
                return quote;
            }
        } catch {
            // coba simbol berikutnya
        }
    }

    try {
        const resolvedSymbol = await resolveAlphaVantageSymbol(activeTicker, apiKey);
        if (!resolvedSymbol || candidateSymbols.includes(resolvedSymbol)) return null;

        const quote = await fetchAlphaVantageQuote(activeTicker, resolvedSymbol, apiKey);
        if (!quote) return null;

        writeLiveCache(stockQuoteCache, activeTicker, quote, STOCK_QUOTE_CACHE_TTL_MS);
        return quote;
    } catch {
        return null;
    }
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
    const buyFee = grossValue * (brokerFeePercent / 100);
    const sellFee = grossValue * (levyFeePercent / 100);
    const brokerFee = side === StockTransactionSide.BUY ? buyFee : 0;
    const levyFee = side === StockTransactionSide.SELL ? sellFee : 0;
    const totalFee = brokerFee + levyFee;
    const netValue = side === StockTransactionSide.BUY
        ? grossValue + totalFee
        : grossValue - totalFee;

    return {
        grossValue,
        brokerFee,
        levyFee,
        netValue
    };
};

const getCashDelta = (side: StockTransactionSide, netValue: number) =>
    side === StockTransactionSide.BUY ? -netValue : netValue;

const getLotDelta = (side: StockTransactionSide, lot: number) =>
    side === StockTransactionSide.BUY ? lot : -lot;

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

const ensureStockSellLots = async (
    trx: Prisma.TransactionClient,
    payload: {
        side: StockTransactionSide;
        ownerId: string;
        accountId: string;
        ticker: string;
        lot: number;
    },
    existing?: {
        id?: string;
        side: StockTransactionSide;
        ownerId: string;
        accountId: string;
        ticker: string;
        lot: number;
    } | null
) => {
    if (payload.side !== StockTransactionSide.SELL) return;

    const [stockRows, ipoRows] = await Promise.all([
        trx.stockTransaction.findMany({
            where: {
                ownerId: payload.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker,
                ...(existing?.id ? { id: { not: existing.id } } : {})
            },
            select: {
                side: true,
                lot: true
            }
        }),
        trx.ipoTransaction.findMany({
            where: {
                ownerId: payload.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker
            },
            select: {
                side: true,
                lot: true
            }
        })
    ]);

    const availableLots = [...stockRows, ...ipoRows].reduce(
        (sum, row) => sum + getLotDelta(row.side, Number(row.lot || 0)),
        0
    );

    if (availableLots < payload.lot) {
        throw new Error(
            `Lot saham tidak cukup untuk dijual ` +
            `(tersedia ${new Intl.NumberFormat('id-ID').format(Math.max(0, availableLots))} lot)`
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

router.get('/quotes', async (req, res) => {
    try {
        const apiKey = getAlphaVantageApiKey();
        const rawTickers = typeof req.query.tickers === 'string' ? req.query.tickers : '';
        const tickers = Array.from(new Set(
            rawTickers
                .split(',')
                .map((value) => toTicker(value))
                .filter(Boolean)
        )).slice(0, 10);

        if (!apiKey) {
            return res.json({
                configured: false,
                provider: 'alpha-vantage',
                quotes: {}
            });
        }

        const quotes: Record<string, StockQuotePayload> = {};

        for (const ticker of tickers) {
            const quote = await fetchLiveStockQuote(ticker, apiKey);
            if (quote) {
                quotes[ticker] = quote;
            }
        }

        res.json({
            configured: true,
            provider: 'alpha-vantage',
            quotes
        });
    } catch (error) {
        console.error('Get live stock quotes error:', error);
        res.status(500).json({ error: 'Gagal mengambil harga saham terbaru' });
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
            await ensureStockSellLots(trx, {
                side: payload.side,
                ownerId: payload.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker,
                lot: payload.lot
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
            await ensureStockSellLots(
                trx,
                {
                    side: payload.side,
                    ownerId: payload.ownerId,
                    accountId: payload.accountId,
                    ticker: payload.ticker,
                    lot: payload.lot
                },
                {
                    id: existing.id,
                    side: existing.side,
                    ownerId: existing.ownerId,
                    accountId: existing.accountId,
                    ticker: existing.ticker,
                    lot: existing.lot
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
