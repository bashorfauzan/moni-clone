import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';
import { recordDataAccessMode } from './dataAccessMode';
import { getErrorMessage } from './errors';

export type Owner = { id: string; name: string };
export type Account = {
    id: string;
    name: string;
    type: string;
    accountNumber?: string | null;
    appPackageName?: string | null;
    appDeepLink?: string | null;
    appStoreUrl?: string | null;
    stockBrokerFeePercent?: number;
    stockLevyFeePercent?: number;
    balance: number;
    ownerId?: string;
    ownerBalances?: Record<string, number>;
};
export type Activity = { id: string; name: string };

export type MasterMeta = {
    owners: Owner[];
    accounts: Account[];
    activities: Activity[];
};

type AccountPayload = {
    name: string;
    type: string;
    balance: number;
    ownerId?: string;
    accountNumber?: string | null;
    appPackageName?: string | null;
    appDeepLink?: string | null;
    appStoreUrl?: string | null;
    stockBrokerFeePercent?: number;
    stockLevyFeePercent?: number;
};

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

const normalizeOwner = (row: any): Owner => ({
    id: row.id,
    name: row.name
});

const normalizeAccount = (row: any): Account => ({
    id: row.id,
    name: row.name,
    type: row.type,
    accountNumber: row.accountNumber ?? row.account_number ?? null,
    appPackageName: row.appPackageName ?? row.app_package_name ?? null,
    appDeepLink: row.appDeepLink ?? row.app_deep_link ?? null,
    appStoreUrl: row.appStoreUrl ?? row.app_store_url ?? null,
    stockBrokerFeePercent: Number(row.stockBrokerFeePercent ?? row.stock_broker_fee_percent ?? 0),
    stockLevyFeePercent: Number(row.stockLevyFeePercent ?? row.stock_levy_fee_percent ?? 0),
    balance: Number(row.balance ?? 0),
    ownerId: row.ownerId ?? row.owner_id,
    ownerBalances: row.ownerBalances && typeof row.ownerBalances === 'object'
        ? Object.fromEntries(
            Object.entries(row.ownerBalances).map(([ownerId, amount]) => [ownerId, Number(amount ?? 0)])
        )
        : undefined
});

const normalizeActivity = (row: any): Activity => ({
    id: row.id,
    name: row.name
});

const normalizeTxType = (type?: string) => type === 'TOP_UP' ? 'TRANSFER' : type;

const buildOwnerBalancesByAccount = ({
    accounts,
    transactions,
    stockTransactions,
    ipoTransactions
}: {
    accounts: Array<{ id: string }>;
    transactions: Array<{ type?: string; amount?: number; ownerId?: string; sourceAccountId?: string | null; destinationAccountId?: string | null }>;
    stockTransactions: Array<{ ownerId?: string; accountId?: string | null; side?: string; netValue?: number }>;
    ipoTransactions: Array<{ ownerId?: string; accountId?: string | null; side?: string; netValue?: number }>;
}) => {
    const ownerBalanceMap = new Map<string, Map<string, number>>();

    for (const account of accounts) {
        ownerBalanceMap.set(account.id, new Map<string, number>());
    }

    const adjust = (accountId?: string | null, ownerId?: string, delta = 0) => {
        if (!accountId || !ownerId || !Number.isFinite(delta) || delta === 0) return;
        const accountMap = ownerBalanceMap.get(accountId);
        if (!accountMap) return;
        accountMap.set(ownerId, (accountMap.get(ownerId) || 0) + delta);
    };

    for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        if (!Number.isFinite(amount) || amount === 0 || !tx.ownerId) continue;

        const type = normalizeTxType(tx.type);
        if (type === 'INCOME') adjust(tx.destinationAccountId, tx.ownerId, amount);
        if (type === 'EXPENSE') adjust(tx.sourceAccountId, tx.ownerId, -amount);
        if (type === 'TRANSFER') {
            adjust(tx.sourceAccountId, tx.ownerId, -amount);
            adjust(tx.destinationAccountId, tx.ownerId, amount);
        }
    }

    for (const tx of stockTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!tx.ownerId || !tx.accountId || !Number.isFinite(amount) || amount === 0) continue;
        adjust(tx.accountId, tx.ownerId, tx.side === 'BUY' ? -amount : amount);
    }

    for (const tx of ipoTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!tx.ownerId || !tx.accountId || !Number.isFinite(amount) || amount === 0) continue;
        adjust(tx.accountId, tx.ownerId, tx.side === 'BUY' ? -amount : amount);
    }

    return Object.fromEntries(
        Array.from(ownerBalanceMap.entries()).map(([accountId, balances]) => [
            accountId,
            Object.fromEntries(Array.from(balances.entries()))
        ])
    ) as Record<string, Record<string, number>>;
};

export const fetchMasterMeta = async (): Promise<MasterMeta> => {
    if (useDirectSupabaseData && supabase) {
        const [ownersRes, accountsRes, activitiesRes, transactionsRes, stockTransactionsRes, ipoTransactionsRes] = await Promise.all([
            supabase.from('Owner').select('id, name').order('createdAt', { ascending: true }),
            supabase.from('Account').select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, stockBrokerFeePercent, stockLevyFeePercent, balance, ownerId').order('createdAt', { ascending: false }),
            supabase.from('Activity').select('id, name').order('createdAt', { ascending: false }),
            supabase.from('Transaction').select('type, amount, ownerId, sourceAccountId, destinationAccountId, isValidated').eq('isValidated', true),
            supabase.from('StockTransaction').select('ownerId, accountId, side, netValue'),
            supabase.from('IpoTransaction').select('ownerId, accountId, side, netValue')
        ]);

        if (!ownersRes.error && !accountsRes.error && !activitiesRes.error && !transactionsRes.error && !stockTransactionsRes.error && !ipoTransactionsRes.error) {
            const ownerBalancesByAccount = buildOwnerBalancesByAccount({
                accounts: accountsRes.data || [],
                transactions: transactionsRes.data || [],
                stockTransactions: stockTransactionsRes.data || [],
                ipoTransactions: ipoTransactionsRes.data || []
            });
            recordDataAccessMode('master', 'direct-supabase', 'Master data berhasil dibaca langsung dari Supabase.');
            return {
                owners: (ownersRes.data || []).map(normalizeOwner),
                accounts: (accountsRes.data || []).map((row) => normalizeAccount({
                    ...row,
                    ownerBalances: ownerBalancesByAccount[row.id] || {}
                })),
                activities: (activitiesRes.data || []).map(normalizeActivity)
            };
        }

        console.warn('Supabase master meta query failed, falling back to backend API.', {
            ownersError: ownersRes.error,
            accountsError: accountsRes.error,
            activitiesError: activitiesRes.error
        });
        recordDataAccessMode(
            'master',
            'supabase-fallback-to-api',
            getErrorMessage(
                ownersRes.error || accountsRes.error || activitiesRes.error,
                'Query Supabase gagal, fallback ke backend API.'
            )
        );
    }

    const response = await api.get('/master/meta');
    recordDataAccessMode('master', 'backend-api', 'Master data dibaca lewat endpoint backend.');
    return {
        owners: (response.data.owners || []).map(normalizeOwner),
        accounts: (response.data.accounts || []).map(normalizeAccount),
        activities: (response.data.activities || []).map(normalizeActivity)
    };
};

export const createAccount = async (payload: AccountPayload): Promise<Account> => {
    if (useDirectSupabaseData && supabase) {
        const timestamp = nowIso();
        const { data, error } = await supabase
            .from('Account')
            .insert({
                id: newId(),
                ...payload,
                createdAt: timestamp,
                updatedAt: timestamp
            })
            .select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, stockBrokerFeePercent, stockLevyFeePercent, balance, ownerId')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Create rekening berhasil langsung ke Supabase.');
            return normalizeAccount(data);
        }
        console.warn('Supabase account create failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Create rekening fallback ke backend API.'));
    }

    const response = await api.post('/master/accounts', payload);
    recordDataAccessMode('master', 'backend-api', 'Create rekening berhasil lewat backend API.');
    return normalizeAccount(response.data);
};

export const updateAccount = async (id: string, payload: Partial<AccountPayload>): Promise<Account> => {
    if (useDirectSupabaseData && supabase) {
        const { data, error } = await supabase
            .from('Account')
            .update({
                ...payload,
                updatedAt: nowIso()
            })
            .eq('id', id)
            .select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, stockBrokerFeePercent, stockLevyFeePercent, balance, ownerId')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Update rekening berhasil langsung ke Supabase.');
            return normalizeAccount(data);
        }
        console.warn('Supabase account update failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Update rekening fallback ke backend API.'));
    }

    const response = await api.put(`/master/accounts/${id}`, payload);
    recordDataAccessMode('master', 'backend-api', 'Update rekening berhasil lewat backend API.');
    return normalizeAccount(response.data);
};

export const deleteAccount = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Account').delete().eq('id', id);
        if (!error) {
            recordDataAccessMode('master', 'direct-supabase', 'Hapus rekening berhasil langsung di Supabase.');
            return;
        }
        console.warn('Supabase account delete failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Hapus rekening fallback ke backend API.'));
    }

    await api.delete(`/master/accounts/${id}`);
    recordDataAccessMode('master', 'backend-api', 'Hapus rekening berhasil lewat backend API.');
};

export const createActivity = async (name: string): Promise<Activity> => {
    if (useDirectSupabaseData && supabase) {
        const timestamp = nowIso();
        const { data, error } = await supabase
            .from('Activity')
            .insert({
                id: newId(),
                name,
                createdAt: timestamp,
                updatedAt: timestamp
            })
            .select('id, name')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Create kategori berhasil langsung ke Supabase.');
            return normalizeActivity(data);
        }
        console.warn('Supabase activity create failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Create kategori fallback ke backend API.'));
    }

    const response = await api.post('/master/activities', { name });
    recordDataAccessMode('master', 'backend-api', 'Create kategori berhasil lewat backend API.');
    return normalizeActivity(response.data);
};

export const updateActivity = async (id: string, name: string): Promise<Activity> => {
    if (useDirectSupabaseData && supabase) {
        const { data, error } = await supabase
            .from('Activity')
            .update({
                name,
                updatedAt: nowIso()
            })
            .eq('id', id)
            .select('id, name')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Update kategori berhasil langsung ke Supabase.');
            return normalizeActivity(data);
        }
        console.warn('Supabase activity update failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Update kategori fallback ke backend API.'));
    }

    const response = await api.put(`/master/activities/${id}`, { name });
    recordDataAccessMode('master', 'backend-api', 'Update kategori berhasil lewat backend API.');
    return normalizeActivity(response.data);
};

export const deleteActivity = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Activity').delete().eq('id', id);
        if (!error) {
            recordDataAccessMode('master', 'direct-supabase', 'Hapus kategori berhasil langsung di Supabase.');
            return;
        }
        console.warn('Supabase activity delete failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Hapus kategori fallback ke backend API.'));
    }

    await api.delete(`/master/activities/${id}`);
    recordDataAccessMode('master', 'backend-api', 'Hapus kategori berhasil lewat backend API.');
};

export const createOwner = async (name: string): Promise<Owner> => {
    if (useDirectSupabaseData && supabase) {
        const timestamp = nowIso();
        const { data, error } = await supabase
            .from('Owner')
            .insert({
                id: newId(),
                name,
                createdAt: timestamp,
                updatedAt: timestamp
            })
            .select('id, name')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Create pemilik berhasil langsung ke Supabase.');
            return normalizeOwner(data);
        }
        console.warn('Supabase owner create failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Create pemilik fallback ke backend API.'));
    }

    const response = await api.post('/master/owners', { name });
    recordDataAccessMode('master', 'backend-api', 'Create pemilik berhasil lewat backend API.');
    return normalizeOwner(response.data);
};

export const updateOwner = async (id: string, name: string): Promise<Owner> => {
    if (useDirectSupabaseData && supabase) {
        const { data, error } = await supabase
            .from('Owner')
            .update({
                name,
                updatedAt: nowIso()
            })
            .eq('id', id)
            .select('id, name')
            .single();

        if (!error && data) {
            recordDataAccessMode('master', 'direct-supabase', 'Update pemilik berhasil langsung ke Supabase.');
            return normalizeOwner(data);
        }
        console.warn('Supabase owner update failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Update pemilik fallback ke backend API.'));
    }

    const response = await api.put(`/master/owners/${id}`, { name });
    recordDataAccessMode('master', 'backend-api', 'Update pemilik berhasil lewat backend API.');
    return normalizeOwner(response.data);
};

export const deleteOwner = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Owner').delete().eq('id', id);
        if (!error) {
            recordDataAccessMode('master', 'direct-supabase', 'Hapus pemilik berhasil langsung di Supabase.');
            return;
        }
        console.warn('Supabase owner delete failed, falling back to backend API.', error);
        recordDataAccessMode('master', 'supabase-fallback-to-api', getErrorMessage(error, 'Hapus pemilik fallback ke backend API.'));
    }

    await api.delete(`/master/owners/${id}`);
    recordDataAccessMode('master', 'backend-api', 'Hapus pemilik berhasil lewat backend API.');
};
