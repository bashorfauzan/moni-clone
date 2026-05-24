import { supabase } from '../lib/supabase';

export type StockSide = 'BUY' | 'SELL';
export type IpoStatus = 'PESAN' | 'JATAH' | 'TIDAK_JATAH' | 'JUAL';

const SHARES_PER_LOT = 100;

export const ensureSupabase = () => {
    if (!supabase) {
        throw new Error('Supabase belum terhubung');
    }

    return supabase;
};

export const formatIdr = (value: number) =>
    new Intl.NumberFormat('id-ID').format(Math.max(0, Number(value || 0)));

export const computeStockMoney = ({
    side,
    lot,
    pricePerShare,
    brokerFeePercent,
    levyFeePercent
}: {
    side: StockSide;
    lot: number;
    pricePerShare: number;
    brokerFeePercent: number;
    levyFeePercent: number;
}) => {
    const shares = lot * SHARES_PER_LOT;
    const grossValue = shares * pricePerShare;
    const brokerFee = grossValue * (brokerFeePercent / 100);
    const levyFee = grossValue * (levyFeePercent / 100);
    const netValue = side === 'BUY'
        ? grossValue + brokerFee + levyFee
        : grossValue - brokerFee - levyFee;

    return {
        grossValue,
        brokerFee,
        levyFee,
        netValue
    };
};

export const computeBalanceMapDirect = async () => {
    const sb = ensureSupabase();

    const [{ data: accounts, error: accountError }, { data: txs, error: txError }, { data: stockTxs, error: stockError }, { data: ipoTxs, error: ipoError }] = await Promise.all([
        sb.from('Account').select('id'),
        sb.from('Transaction').select('type, amount, sourceAccountId, destinationAccountId, isValidated').eq('isValidated', true),
        sb.from('StockTransaction').select('accountId, side, netValue'),
        sb.from('IpoTransaction').select('accountId, side, netValue')
    ]);

    if (accountError) throw accountError;
    if (txError) throw txError;
    if (stockError) throw stockError;
    if (ipoError) throw ipoError;

    const balanceMap = new Map<string, number>();

    (accounts || []).forEach((account: any) => {
        balanceMap.set(account.id, 0);
    });

    (txs || []).forEach((tx: any) => {
        const amount = Number(tx.amount || 0);
        if (!Number.isFinite(amount) || amount === 0) return;

        if (tx.type === 'INCOME' && tx.destinationAccountId) {
            balanceMap.set(tx.destinationAccountId, (balanceMap.get(tx.destinationAccountId) || 0) + amount);
        }

        if (tx.type === 'EXPENSE' && tx.sourceAccountId) {
            balanceMap.set(tx.sourceAccountId, (balanceMap.get(tx.sourceAccountId) || 0) - amount);
        }

        if (tx.type === 'TRANSFER') {
            if (tx.sourceAccountId) {
                balanceMap.set(tx.sourceAccountId, (balanceMap.get(tx.sourceAccountId) || 0) - amount);
            }
            if (tx.destinationAccountId) {
                balanceMap.set(tx.destinationAccountId, (balanceMap.get(tx.destinationAccountId) || 0) + amount);
            }
        }
    });

    (stockTxs || []).forEach((tx: any) => {
        const amount = Number(tx.netValue || 0);
        if (!tx.accountId || !Number.isFinite(amount) || amount === 0) return;
        const signed = tx.side === 'BUY' ? -amount : amount;
        balanceMap.set(tx.accountId, (balanceMap.get(tx.accountId) || 0) + signed);
    });

    (ipoTxs || []).forEach((tx: any) => {
        const amount = Number(tx.netValue || 0);
        if (!tx.accountId || !Number.isFinite(amount) || amount === 0) return;
        const signed = tx.side === 'BUY' ? -amount : amount;
        balanceMap.set(tx.accountId, (balanceMap.get(tx.accountId) || 0) + signed);
    });

    return balanceMap;
};

export const syncAccountBalancesDirect = async () => {
    const sb = ensureSupabase();
    const balanceMap = await computeBalanceMapDirect();

    await Promise.all(
        Array.from(balanceMap.entries()).map(async ([accountId, balance]) => {
            const { error } = await sb
                .from('Account')
                .update({
                    balance,
                    updatedAt: new Date().toISOString()
                })
                .eq('id', accountId);

            if (error) throw error;
        })
    );

    return balanceMap;
};

export const getAvailableAccountCashDirect = async (accountId: string) => {
    const balanceMap = await computeBalanceMapDirect();
    return Number(balanceMap.get(accountId) || 0);
};

export const getReservedIpoCashDirect = async (accountId: string, excludeOrderId?: string) => {
    const sb = ensureSupabase();
    let query = sb
        .from('IpoOrder')
        .select('id, lotRequested, ipoPrice')
        .eq('accountId', accountId)
        .eq('status', 'PESAN');

    if (excludeOrderId) {
        query = query.neq('id', excludeOrderId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).reduce((sum: number, row: any) => sum + (Number(row.lotRequested || 0) * SHARES_PER_LOT * Number(row.ipoPrice || 0)), 0);
};

export const ensureStockFundsDirect = async (
    accountId: string,
    netValue: number,
    side: StockSide,
    existing?: { side: StockSide; accountId: string; netValue: number } | null
) => {
    if (side !== 'BUY') return;

    let available = await getAvailableAccountCashDirect(accountId);

    if (existing) {
        available -= existing.side === 'BUY' ? -existing.netValue : existing.netValue;
    }

    if (available < netValue) {
        throw new Error(`Saldo rekening saham tidak cukup (tersedia Rp ${formatIdr(available)})`);
    }
};

export const ensureIpoFundsDirect = async (
    accountId: string,
    status: IpoStatus,
    lotRequested: number,
    lotAllocated: number,
    ipoPrice: number,
    excludeOrderId?: string
) => {
    if (status === 'TIDAK_JATAH') return;

    const available = await getAvailableAccountCashDirect(accountId);
    const reserved = await getReservedIpoCashDirect(accountId, excludeOrderId);
    const freeCash = available - reserved;
    const requiredCash = (status === 'PESAN' ? lotRequested : lotAllocated) * SHARES_PER_LOT * ipoPrice;

    if (freeCash < requiredCash) {
        throw new Error(`Saldo rekening IPO tidak cukup (tersedia Rp ${formatIdr(freeCash)}, butuh Rp ${formatIdr(requiredCash)})`);
    }
};
