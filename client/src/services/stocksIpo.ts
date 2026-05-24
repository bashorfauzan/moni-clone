import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';
import { recordDataAccessMode } from './dataAccessMode';
import {
    ensureIpoFundsDirect,
    ensureSupabase,
    syncAccountBalancesDirect
} from './stocksDirect';

export type IpoOrderStatus = 'PESAN' | 'JATAH' | 'TIDAK_JATAH' | 'JUAL';
export type IpoSide = 'BUY' | 'SELL';

export type IpoTransaction = {
    id: string;
    ipoOrderId: string;
    ownerId: string;
    accountId: string;
    ticker: string;
    side: IpoSide;
    lot: number;
    pricePerShare: number;
    grossValue: number;
    feePercent: number;
    feeAmount: number;
    netValue: number;
    tradedAt: string;
    owner?: { id: string; name: string };
    account?: { id: string; name: string; type: string };
    ipoOrder?: {
        id: string;
        ticker: string;
        broker: string;
        status: IpoOrderStatus;
    };
};

export type IpoOrder = {
    id: string;
    ownerId: string;
    accountId: string;
    ticker: string;
    broker: string;
    ipoPrice: number;
    lotRequested: number;
    lotAllocated: number;
    sellPrice?: number | null;
    status: IpoOrderStatus;
    notes?: string | null;
    orderedAt: string;
    allottedAt?: string | null;
    soldAt?: string | null;
    owner?: { id: string; name: string };
    account?: { id: string; name: string; type: string };
    transactions?: IpoTransaction[];
};

export type IpoOrderPayload = {
    ownerId: string;
    accountId: string;
    ticker: string;
    broker: string;
    ipoPrice: number;
    lotRequested: number;
    lotAllocated: number;
    sellPrice?: number | null;
    status: IpoOrderStatus;
    notes?: string;
    orderedAt: string;
    allottedAt?: string;
    soldAt?: string;
};

export type IpoFilter = {
    ownerId?: string;
    accountId?: string;
    ticker?: string;
    status?: IpoOrderStatus;
};

const SHARES_PER_LOT = 100;

const toQuery = (filter: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : '';
};

const recordStocksMode = (
    mode: 'backend-api' | 'direct-supabase' | 'supabase-fallback-to-api',
    detail: string
) => {
    recordDataAccessMode('stocks', mode, detail);
};

const normalizeIpoOrder = (row: any): IpoOrder => ({
    id: row.id,
    ownerId: row.ownerId ?? row.owner_id,
    accountId: row.accountId ?? row.account_id,
    ticker: String(row.ticker || '').toUpperCase(),
    broker: row.broker,
    ipoPrice: Number(row.ipoPrice ?? row.ipo_price ?? 0),
    lotRequested: Number(row.lotRequested ?? row.lot_requested ?? 0),
    lotAllocated: Number(row.lotAllocated ?? row.lot_allocated ?? 0),
    sellPrice: row.sellPrice ?? row.sell_price ?? null,
    status: row.status,
    notes: row.notes ?? null,
    orderedAt: row.orderedAt ?? row.ordered_at,
    allottedAt: row.allottedAt ?? row.allotted_at ?? null,
    soldAt: row.soldAt ?? row.sold_at ?? null,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name, type: row.account.type } : undefined,
    transactions: Array.isArray(row.transactions) ? row.transactions.map(normalizeIpoTransaction) : undefined
});

const normalizeIpoTransaction = (row: any): IpoTransaction => ({
    id: row.id,
    ipoOrderId: row.ipoOrderId ?? row.ipo_order_id,
    ownerId: row.ownerId ?? row.owner_id,
    accountId: row.accountId ?? row.account_id,
    ticker: String(row.ticker || '').toUpperCase(),
    side: row.side,
    lot: Number(row.lot || 0),
    pricePerShare: Number(row.pricePerShare ?? row.price_per_share ?? 0),
    grossValue: Number(row.grossValue ?? row.gross_value ?? 0),
    feePercent: Number(row.feePercent ?? row.fee_percent ?? 0),
    feeAmount: Number(row.feeAmount ?? row.fee_amount ?? 0),
    netValue: Number(row.netValue ?? row.net_value ?? 0),
    tradedAt: row.tradedAt ?? row.traded_at,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name, type: row.account.type } : undefined,
    ipoOrder: row.ipoOrder ? {
        id: row.ipoOrder.id,
        ticker: row.ipoOrder.ticker,
        broker: row.ipoOrder.broker,
        status: row.ipoOrder.status
    } : undefined
});

const runStocksIpoAction = async <T>(
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

export const fetchIpoOrders = async (filter: IpoFilter = {}): Promise<IpoOrder[]> =>
    runStocksIpoAction(
        async () => {
            if (!supabase) return [];
            let query = supabase
                .from('IpoOrder')
                .select(`
                    id,
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
                    soldAt,
                    owner:Owner(id, name),
                    account:Account(id, name, type),
                    transactions:IpoTransaction(*)
                `)
                .order('orderedAt', { ascending: false });

            if (filter.ownerId) query = query.eq('ownerId', filter.ownerId);
            if (filter.accountId) query = query.eq('accountId', filter.accountId);
            if (filter.ticker) query = query.eq('ticker', filter.ticker.toUpperCase());
            if (filter.status) query = query.eq('status', filter.status);

            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map(normalizeIpoOrder);
        },
        async () => {
            const response = await api.get(`/stocks/ipo/orders${toQuery(filter)}`);
            recordStocksMode('backend-api', 'Order IPO dibaca lewat backend API.');
            return response.data || [];
        },
        'Order IPO dibaca langsung dari Supabase.'
    );

export const createIpoOrder = async (payload: IpoOrderPayload): Promise<IpoOrder> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data: account, error: accountError } = await sb
            .from('Account')
            .select('id, type, ownerId')
            .eq('id', payload.accountId)
            .limit(1)
            .maybeSingle();

        if (accountError) throw accountError;
        if (!account?.id) throw new Error('Rekening IPO tidak ditemukan');
        if (!['RDN', 'Sekuritas'].includes(account.type)) throw new Error('Rekening IPO harus bertipe RDN atau Sekuritas');

        await ensureIpoFundsDirect(
            payload.accountId,
            payload.status,
            Number(payload.lotRequested),
            Number(payload.lotAllocated || 0),
            Number(payload.ipoPrice)
        );

        const now = new Date().toISOString();
        const { data: order, error } = await sb
            .from('IpoOrder')
            .insert({
                id: crypto.randomUUID(),
                ownerId: payload.ownerId || account.ownerId,
                accountId: payload.accountId,
                ticker: payload.ticker.toUpperCase(),
                broker: payload.broker.trim(),
                ipoPrice: Number(payload.ipoPrice),
                lotRequested: Number(payload.lotRequested),
                lotAllocated: Number(payload.lotAllocated || 0),
                sellPrice: payload.sellPrice ?? null,
                status: payload.status,
                notes: payload.notes?.trim() || null,
                orderedAt: payload.orderedAt,
                allottedAt: payload.allottedAt || null,
                soldAt: payload.soldAt || null,
                createdAt: now,
                updatedAt: now
            })
            .select('*')
            .single();

        if (error) throw error;

        await syncIpoTransactionsDirect(order.id, {
            ownerId: order.ownerId,
            accountId: order.accountId,
            ticker: order.ticker,
            ipoPrice: Number(order.ipoPrice),
            lotAllocated: Number(order.lotAllocated || 0),
            sellPrice: order.sellPrice ? Number(order.sellPrice) : null,
            status: order.status,
            orderedAt: order.orderedAt,
            allottedAt: order.allottedAt,
            soldAt: order.soldAt
        });

        await syncAccountBalancesDirect();
        const [fresh] = await fetchIpoOrders({ accountId: order.accountId, ticker: order.ticker });
        recordStocksMode('direct-supabase', 'Order IPO dibuat langsung ke Supabase.');
        return fresh || normalizeIpoOrder(order);
    }

    const response = await api.post('/stocks/ipo/orders', payload);
    return response.data;
};

export const updateIpoOrder = async (id: string, payload: Partial<IpoOrderPayload>): Promise<IpoOrder> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data: existing, error: existingError } = await sb
            .from('IpoOrder')
            .select('*')
            .eq('id', id)
            .limit(1)
            .maybeSingle();

        if (existingError) throw existingError;
        if (!existing?.id) throw new Error('Order IPO tidak ditemukan');

        const merged = {
            ownerId: payload.ownerId ?? existing.ownerId,
            accountId: payload.accountId ?? existing.accountId,
            ticker: String(payload.ticker ?? existing.ticker).toUpperCase(),
            broker: String(payload.broker ?? existing.broker),
            ipoPrice: Number(payload.ipoPrice ?? existing.ipoPrice),
            lotRequested: Number(payload.lotRequested ?? existing.lotRequested),
            lotAllocated: Number(payload.lotAllocated ?? existing.lotAllocated ?? 0),
            sellPrice: payload.sellPrice !== undefined ? payload.sellPrice : existing.sellPrice,
            status: payload.status ?? existing.status,
            notes: payload.notes !== undefined ? payload.notes : existing.notes,
            orderedAt: payload.orderedAt ?? existing.orderedAt,
            allottedAt: payload.allottedAt !== undefined ? payload.allottedAt : existing.allottedAt,
            soldAt: payload.soldAt !== undefined ? payload.soldAt : existing.soldAt
        };

        await ensureIpoFundsDirect(
            merged.accountId,
            merged.status,
            merged.lotRequested,
            merged.lotAllocated,
            merged.ipoPrice,
            id
        );

        const { data: updated, error } = await sb
            .from('IpoOrder')
            .update({
                ownerId: merged.ownerId,
                accountId: merged.accountId,
                ticker: merged.ticker,
                broker: merged.broker.trim(),
                ipoPrice: merged.ipoPrice,
                lotRequested: merged.lotRequested,
                lotAllocated: merged.lotAllocated,
                sellPrice: merged.sellPrice ?? null,
                status: merged.status,
                notes: merged.notes?.trim() || null,
                orderedAt: merged.orderedAt,
                allottedAt: merged.allottedAt || null,
                soldAt: merged.soldAt || null,
                updatedAt: new Date().toISOString()
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;

        await syncIpoTransactionsDirect(id, {
            ownerId: updated.ownerId,
            accountId: updated.accountId,
            ticker: updated.ticker,
            ipoPrice: Number(updated.ipoPrice),
            lotAllocated: Number(updated.lotAllocated || 0),
            sellPrice: updated.sellPrice ? Number(updated.sellPrice) : null,
            status: updated.status,
            orderedAt: updated.orderedAt,
            allottedAt: updated.allottedAt,
            soldAt: updated.soldAt
        });

        await syncAccountBalancesDirect();
        const [fresh] = await fetchIpoOrders({ accountId: updated.accountId, ticker: updated.ticker });
        recordStocksMode('direct-supabase', 'Order IPO diubah langsung di Supabase.');
        return fresh || normalizeIpoOrder(updated);
    }

    const response = await api.patch(`/stocks/ipo/orders/${id}`, payload);
    return response.data;
};

export const deleteIpoOrder = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        await sb.from('IpoTransaction').delete().eq('ipoOrderId', id);
        const { error } = await sb.from('IpoOrder').delete().eq('id', id);
        if (error) throw error;
        await syncAccountBalancesDirect();
        recordStocksMode('direct-supabase', 'Order IPO dihapus langsung di Supabase.');
        return;
    }

    await api.delete(`/stocks/ipo/orders/${id}`);
};

export const fetchIpoTransactions = async (filter: Omit<IpoFilter, 'status'> = {}): Promise<IpoTransaction[]> =>
    runStocksIpoAction(
        async () => {
            if (!supabase) return [];
            let query = supabase
                .from('IpoTransaction')
                .select(`
                    id,
                    ipoOrderId,
                    ownerId,
                    accountId,
                    ticker,
                    side,
                    lot,
                    pricePerShare,
                    grossValue,
                    feePercent,
                    feeAmount,
                    netValue,
                    tradedAt,
                    owner:Owner(id, name),
                    account:Account(id, name, type),
                    ipoOrder:IpoOrder(id, ticker, broker, status)
                `)
                .order('tradedAt', { ascending: false });

            if (filter.ownerId) query = query.eq('ownerId', filter.ownerId);
            if (filter.accountId) query = query.eq('accountId', filter.accountId);
            if (filter.ticker) query = query.eq('ticker', filter.ticker.toUpperCase());

            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map(normalizeIpoTransaction);
        },
        async () => {
            const response = await api.get(`/stocks/ipo/transactions${toQuery(filter)}`);
            recordStocksMode('backend-api', 'Transaksi IPO dibaca lewat backend API.');
            return response.data || [];
        },
        'Transaksi IPO dibaca langsung dari Supabase.'
    );

const syncIpoTransactionsDirect = async (
    orderId: string,
    payload: {
        ownerId: string;
        accountId: string;
        ticker: string;
        ipoPrice: number;
        lotAllocated: number;
        sellPrice?: number | null;
        status: IpoOrderStatus;
        orderedAt: string;
        allottedAt?: string | null;
        soldAt?: string | null;
    }
) => {
    const sb = ensureSupabase();
    const now = new Date().toISOString();

    await sb.from('IpoTransaction').delete().eq('ipoOrderId', orderId);

    if (payload.status === 'PESAN' || payload.status === 'TIDAK_JATAH' || Number(payload.lotAllocated || 0) <= 0) {
        return;
    }

    const shares = Number(payload.lotAllocated) * SHARES_PER_LOT;
    const buyGrossValue = shares * Number(payload.ipoPrice);

    const buyRow = {
        id: crypto.randomUUID(),
        ipoOrderId: orderId,
        ownerId: payload.ownerId,
        accountId: payload.accountId,
        ticker: payload.ticker.toUpperCase(),
        side: 'BUY',
        lot: Number(payload.lotAllocated),
        pricePerShare: Number(payload.ipoPrice),
        grossValue: buyGrossValue,
        feePercent: 0,
        feeAmount: 0,
        netValue: buyGrossValue,
        tradedAt: payload.allottedAt || payload.orderedAt,
        createdAt: now,
        updatedAt: now
    };

    const rows: any[] = [buyRow];

    if (payload.status === 'JUAL' && payload.sellPrice) {
        const sellGrossValue = shares * Number(payload.sellPrice);
        rows.push({
            id: crypto.randomUUID(),
            ipoOrderId: orderId,
            ownerId: payload.ownerId,
            accountId: payload.accountId,
            ticker: payload.ticker.toUpperCase(),
            side: 'SELL',
            lot: Number(payload.lotAllocated),
            pricePerShare: Number(payload.sellPrice),
            grossValue: sellGrossValue,
            feePercent: 0,
            feeAmount: 0,
            netValue: sellGrossValue,
            tradedAt: payload.soldAt || payload.allottedAt || payload.orderedAt,
            createdAt: now,
            updatedAt: now
        });
    }

    const { error } = await sb.from('IpoTransaction').insert(rows);
    if (error) throw error;
};
