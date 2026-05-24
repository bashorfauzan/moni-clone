import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';
import { recordDataAccessMode } from './dataAccessMode';
import {
    computeStockMoney,
    ensureStockFundsDirect,
    ensureSupabase,
    syncAccountBalancesDirect
} from './stocksDirect';

export type StockTransactionSide = 'BUY' | 'SELL';

export type StockTransaction = {
    id: string;
    ownerId: string;
    accountId: string;
    ticker: string;
    side: StockTransactionSide;
    lot: number;
    pricePerShare: number;
    grossValue: number;
    brokerFee: number;
    levyFee: number;
    netValue: number;
    tradedAt: string;
    notes?: string | null;
    owner?: { id: string; name: string };
    account?: { id: string; name: string; type: string };
};

export type StockPosition = {
    ticker: string;
    totalLots: number;
    totalShares: number;
    avgBuyPrice: number;
    avgCostPerShare: number;
    totalCost: number;
    marketValue: number;
    realizedPnl: number;
    buyCount: number;
    sellCount: number;
    lastTradedAt: string;
    accountId?: string;
    accountName?: string;
};

export type StockTransactionPayload = {
    ownerId: string;
    accountId: string;
    ticker: string;
    side: StockTransactionSide;
    lot: number;
    pricePerShare: number;
    tradedAt: string;
    notes?: string;
};

export type StockFilter = {
    ownerId?: string;
    accountId?: string;
    ticker?: string;
    dateFrom?: string;
    dateTo?: string;
    groupByAccount?: boolean;
};

type PositionInput = {
    accountId: string;
    ticker: string;
    side: StockTransactionSide;
    lot: number;
    pricePerShare: number;
    grossValue: number;
    netValue: number;
    tradedAt: string;
    accountName?: string;
};

const SHARES_PER_LOT = 100;

const recordStocksMode = (
    mode: 'backend-api' | 'direct-supabase' | 'supabase-fallback-to-api',
    detail: string
) => {
    recordDataAccessMode('stocks', mode, detail);
};

const toQuery = (filter: StockFilter = {}) => {
    const params = new URLSearchParams();

    Object.entries(filter).forEach(([key, value]) => {
        if (typeof value === 'boolean') {
            if (value) params.set(key, 'true');
            return;
        }
        if (value) params.set(key, value);
    });

    const query = params.toString();
    return query ? `?${query}` : '';
};

const normalizeStockTransaction = (row: any): StockTransaction => ({
    id: row.id,
    ownerId: row.ownerId ?? row.owner_id,
    accountId: row.accountId ?? row.account_id,
    ticker: String(row.ticker || '').toUpperCase(),
    side: row.side,
    lot: Number(row.lot || 0),
    pricePerShare: Number(row.pricePerShare ?? row.price_per_share ?? 0),
    grossValue: Number(row.grossValue ?? row.gross_value ?? 0),
    brokerFee: Number(row.brokerFee ?? row.broker_fee ?? 0),
    levyFee: Number(row.levyFee ?? row.levy_fee ?? 0),
    netValue: Number(row.netValue ?? row.net_value ?? 0),
    tradedAt: row.tradedAt ?? row.traded_at,
    notes: row.notes ?? null,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name, type: row.account.type } : undefined
});

const round2 = (value: number) => Number(value.toFixed(2));

const calculatePositions = (rows: PositionInput[], groupByAccount = false): StockPosition[] => {
    const grouped = new Map<string, PositionInput[]>();

    for (const row of rows) {
        const ticker = String(row.ticker || '').trim().toUpperCase();
        if (!ticker) continue;
        const key = groupByAccount ? `${row.accountId}::${ticker}` : ticker;
        const current = grouped.get(key) || [];
        current.push({ ...row, ticker });
        grouped.set(key, current);
    }

    const positions: StockPosition[] = [];

    for (const rowsByKey of grouped.values()) {
        const sortedRows = [...rowsByKey].sort((a, b) => new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime());
        const fifoLots: Array<{ remainingShares: number; pricePerShare: number; costPerShare: number }> = [];
        let realizedPnl = 0;
        let buyCount = 0;
        let sellCount = 0;

        for (const row of sortedRows) {
            const shares = Number(row.lot || 0) * SHARES_PER_LOT;
            if (!Number.isFinite(shares) || shares <= 0) continue;

            if (row.side === 'BUY') {
                buyCount += 1;
                fifoLots.push({
                    remainingShares: shares,
                    pricePerShare: Number(row.pricePerShare || 0),
                    costPerShare: shares > 0 ? Number(row.netValue || 0) / shares : 0
                });
                continue;
            }

            sellCount += 1;
            let sharesToSell = shares;
            const proceedsPerShare = shares > 0 ? Number(row.netValue || 0) / shares : 0;

            while (sharesToSell > 0 && fifoLots.length > 0) {
                const firstLot = fifoLots[0];
                if (!firstLot) break;
                const matchedShares = Math.min(firstLot.remainingShares, sharesToSell);
                realizedPnl += (proceedsPerShare - firstLot.costPerShare) * matchedShares;
                firstLot.remainingShares -= matchedShares;
                sharesToSell -= matchedShares;
                if (firstLot.remainingShares <= 0) {
                    fifoLots.shift();
                }
            }
        }

        const totalShares = fifoLots.reduce((sum, lot) => sum + lot.remainingShares, 0);
        const totalCost = fifoLots.reduce((sum, lot) => sum + (lot.remainingShares * lot.costPerShare), 0);
        const totalPriceCost = fifoLots.reduce((sum, lot) => sum + (lot.remainingShares * lot.pricePerShare), 0);
        const first = sortedRows[0];
        const last = sortedRows[sortedRows.length - 1];

        if ((totalShares > 0 || realizedPnl !== 0) && first && last) {
            positions.push({
                ticker: first.ticker,
                totalLots: totalShares / SHARES_PER_LOT,
                totalShares,
                avgBuyPrice: round2(totalShares > 0 ? totalPriceCost / totalShares : 0),
                avgCostPerShare: round2(totalShares > 0 ? totalCost / totalShares : 0),
                totalCost: round2(totalCost),
                marketValue: round2(totalCost),
                realizedPnl: round2(realizedPnl),
                buyCount,
                sellCount,
                lastTradedAt: new Date(last.tradedAt).toISOString(),
                accountId: groupByAccount ? first.accountId : undefined,
                accountName: groupByAccount ? first.accountName : undefined
            });
        }
    }

    return positions.sort((a, b) => {
        if ((a.accountName || '') !== (b.accountName || '')) {
            return (a.accountName || '').localeCompare(b.accountName || '');
        }
        return a.ticker.localeCompare(b.ticker);
    });
};

const fetchStockTransactionsViaApi = async (filter: StockFilter = {}): Promise<StockTransaction[]> => {
    const response = await api.get(`/stocks/transactions${toQuery(filter)}`);
    recordStocksMode('backend-api', 'Transaksi saham dibaca lewat backend API.');
    return response.data || [];
};

const fetchStockTransactionsViaSupabase = async (filter: StockFilter = {}): Promise<StockTransaction[]> => {
    if (!supabase) return [];

    let query = supabase
        .from('StockTransaction')
        .select(`
            id,
            ownerId,
            accountId,
            ticker,
            side,
            lot,
            pricePerShare,
            grossValue,
            brokerFee,
            levyFee,
            netValue,
            tradedAt,
            notes,
            owner:Owner(id, name),
            account:Account(id, name, type)
        `)
        .order('tradedAt', { ascending: false });

    if (filter.ownerId) query = query.eq('ownerId', filter.ownerId);
    if (filter.accountId) query = query.eq('accountId', filter.accountId);
    if (filter.ticker) query = query.eq('ticker', filter.ticker.toUpperCase());
    if (filter.dateFrom) query = query.gte('tradedAt', filter.dateFrom);
    if (filter.dateTo) query = query.lte('tradedAt', filter.dateTo);

    const { data, error } = await query;
    if (error) throw error;

    recordStocksMode('direct-supabase', 'Transaksi saham dibaca langsung dari Supabase.');
    return (data || []).map(normalizeStockTransaction);
};

const fetchStockPositionsViaApi = async (filter: StockFilter = {}): Promise<StockPosition[]> => {
    const response = await api.get(`/stocks/positions${toQuery(filter)}`);
    recordStocksMode('backend-api', 'Posisi saham dibaca lewat backend API.');
    return response.data || [];
};

const fetchStockPositionsViaSupabase = async (filter: StockFilter = {}): Promise<StockPosition[]> => {
    if (!supabase) return [];

    let stockQuery = supabase
        .from('StockTransaction')
        .select(`
            accountId,
            ticker,
            side,
            lot,
            pricePerShare,
            grossValue,
            netValue,
            tradedAt,
            account:Account(id, name)
        `);

    let ipoQuery = supabase
        .from('IpoTransaction')
        .select(`
            accountId,
            ticker,
            side,
            lot,
            pricePerShare,
            grossValue,
            netValue,
            tradedAt,
            account:Account(id, name)
        `);

    if (filter.ownerId) {
        stockQuery = stockQuery.eq('ownerId', filter.ownerId);
        ipoQuery = ipoQuery.eq('ownerId', filter.ownerId);
    }
    if (filter.accountId) {
        stockQuery = stockQuery.eq('accountId', filter.accountId);
        ipoQuery = ipoQuery.eq('accountId', filter.accountId);
    }
    if (filter.ticker) {
        stockQuery = stockQuery.eq('ticker', filter.ticker.toUpperCase());
        ipoQuery = ipoQuery.eq('ticker', filter.ticker.toUpperCase());
    }

    const [stockRes, ipoRes] = await Promise.all([stockQuery, ipoQuery]);
    if (stockRes.error) throw stockRes.error;
    if (ipoRes.error) throw ipoRes.error;

    const mergedRows: PositionInput[] = [
        ...(stockRes.data || []),
        ...(ipoRes.data || [])
    ].map((row: any) => ({
        accountId: row.accountId,
        ticker: row.ticker,
        side: row.side,
        lot: Number(row.lot || 0),
        pricePerShare: Number(row.pricePerShare || 0),
        grossValue: Number(row.grossValue || 0),
        netValue: Number(row.netValue || 0),
        tradedAt: row.tradedAt,
        accountName: row.account?.name
    }));

    recordStocksMode('direct-supabase', 'Posisi saham dihitung langsung dari Supabase.');
    return calculatePositions(mergedRows, Boolean(filter.groupByAccount));
};

const runStocksAction = async <T>(
    action: () => Promise<T>,
    apiFallback: () => Promise<T>,
    directDetail: string
) => {
    if (useDirectSupabaseData && supabase) {
        const result = await action();
        recordStocksMode('direct-supabase', directDetail);
        return result;
    }

    return apiFallback();
};

export const fetchStockTransactions = async (filter: StockFilter = {}): Promise<StockTransaction[]> =>
    runStocksAction(
        () => fetchStockTransactionsViaSupabase(filter),
        () => fetchStockTransactionsViaApi(filter),
        'Transaksi saham dibaca langsung dari Supabase.'
    );

export const createStockTransaction = async (payload: StockTransactionPayload): Promise<StockTransaction> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data: account, error: accountError } = await sb
            .from('Account')
            .select('id, type, ownerId, stockBrokerFeePercent, stockLevyFeePercent')
            .eq('id', payload.accountId)
            .limit(1)
            .maybeSingle();

        if (accountError) throw accountError;
        if (!account?.id) throw new Error('Rekening saham tidak ditemukan');
        if (!['RDN', 'Sekuritas'].includes(account.type)) throw new Error('Rekening saham harus bertipe RDN atau Sekuritas');

        const computed = computeStockMoney({
            side: payload.side,
            lot: Number(payload.lot),
            pricePerShare: Number(payload.pricePerShare),
            brokerFeePercent: Number(account.stockBrokerFeePercent || 0),
            levyFeePercent: Number(account.stockLevyFeePercent || 0)
        });

        await ensureStockFundsDirect(payload.accountId, computed.netValue, payload.side);

        const now = new Date().toISOString();
        const { data, error } = await sb
            .from('StockTransaction')
            .insert({
                id: crypto.randomUUID(),
                ownerId: payload.ownerId || account.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker.toUpperCase(),
                side: payload.side,
                lot: Number(payload.lot),
                pricePerShare: Number(payload.pricePerShare),
                grossValue: computed.grossValue,
                brokerFee: computed.brokerFee,
                levyFee: computed.levyFee,
                netValue: computed.netValue,
                tradedAt: payload.tradedAt,
                notes: payload.notes?.trim() || null,
                createdAt: now,
                updatedAt: now
            })
            .select(`
                id,
                ownerId,
                accountId,
                ticker,
                side,
                lot,
                pricePerShare,
                grossValue,
                brokerFee,
                levyFee,
                netValue,
                tradedAt,
                notes
            `)
            .single();

        if (error) throw error;

        await syncAccountBalancesDirect();
        recordStocksMode('direct-supabase', 'Transaksi saham dibuat langsung ke Supabase.');
        return normalizeStockTransaction(data);
    }

    const response = await api.post('/stocks/transactions', payload);
    recordStocksMode('backend-api', 'Transaksi saham dibuat lewat backend API.');
    return response.data;
};

export const updateStockTransaction = async (id: string, payload: StockTransactionPayload): Promise<StockTransaction> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const [{ data: existing, error: existingError }, { data: account, error: accountError }] = await Promise.all([
            sb.from('StockTransaction').select('id, side, accountId, netValue, ownerId').eq('id', id).limit(1).maybeSingle(),
            sb.from('Account').select('id, type, ownerId, stockBrokerFeePercent, stockLevyFeePercent').eq('id', payload.accountId).limit(1).maybeSingle()
        ]);

        if (existingError) throw existingError;
        if (accountError) throw accountError;
        if (!existing?.id) throw new Error('Transaksi saham tidak ditemukan');
        if (!account?.id) throw new Error('Rekening saham tidak ditemukan');

        const computed = computeStockMoney({
            side: payload.side,
            lot: Number(payload.lot),
            pricePerShare: Number(payload.pricePerShare),
            brokerFeePercent: Number(account.stockBrokerFeePercent || 0),
            levyFeePercent: Number(account.stockLevyFeePercent || 0)
        });

        await ensureStockFundsDirect(
            payload.accountId,
            computed.netValue,
            payload.side,
            {
                side: existing.side,
                accountId: existing.accountId,
                netValue: Number(existing.netValue || 0)
            }
        );

        const { data, error } = await sb
            .from('StockTransaction')
            .update({
                ownerId: payload.ownerId || account.ownerId || existing.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker.toUpperCase(),
                side: payload.side,
                lot: Number(payload.lot),
                pricePerShare: Number(payload.pricePerShare),
                grossValue: computed.grossValue,
                brokerFee: computed.brokerFee,
                levyFee: computed.levyFee,
                netValue: computed.netValue,
                tradedAt: payload.tradedAt,
                notes: payload.notes?.trim() || null,
                updatedAt: new Date().toISOString()
            })
            .eq('id', id)
            .select(`
                id,
                ownerId,
                accountId,
                ticker,
                side,
                lot,
                pricePerShare,
                grossValue,
                brokerFee,
                levyFee,
                netValue,
                tradedAt,
                notes
            `)
            .single();

        if (error) throw error;

        await syncAccountBalancesDirect();
        recordStocksMode('direct-supabase', 'Transaksi saham diubah langsung di Supabase.');
        return normalizeStockTransaction(data);
    }

    const response = await api.patch(`/stocks/transactions/${id}`, payload);
    recordStocksMode('backend-api', 'Transaksi saham diubah lewat backend API.');
    return response.data;
};

export const deleteStockTransaction = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { error } = await sb.from('StockTransaction').delete().eq('id', id);
        if (error) throw error;
        await syncAccountBalancesDirect();
        recordStocksMode('direct-supabase', 'Transaksi saham dihapus langsung di Supabase.');
        return;
    }

    await api.delete(`/stocks/transactions/${id}`);
    recordStocksMode('backend-api', 'Transaksi saham dihapus lewat backend API.');
};

export const fetchStockPositions = async (filter: StockFilter = {}): Promise<StockPosition[]> =>
    runStocksAction(
        () => fetchStockPositionsViaSupabase(filter),
        () => fetchStockPositionsViaApi(filter),
        'Posisi saham dihitung langsung dari Supabase.'
    );
