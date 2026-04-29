import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';

export type TransactionTypeValue = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'TOP_UP' | 'INVESTMENT_IN' | 'INVESTMENT_OUT';

export type TransactionItem = {
    id: string;
    type: string;
    amount: number;
    description?: string;
    date: string;
    isValidated?: boolean;
    notificationInboxId?: string | null;
    ownerId?: string;
    activityId?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    owner?: { id: string; name: string };
    activity?: { id?: string; name?: string };
    sourceAccount?: { id?: string; name?: string; type?: string };
    destinationAccount?: { id?: string; name?: string; type?: string };
};

export type FetchTransactionsOptions = {
    validated?: boolean;
    limit?: number;
};

export type TransactionWritePayload = {
    amount: number;
    description?: string;
    ownerId: string;
    type: TransactionTypeValue;
    sourceAccountId?: string;
    destinationAccountId?: string;
    activityId?: string;
    notificationInboxId?: string;
    date?: string;
};

export type ValidateTransactionPayload = {
    action: 'APPROVE' | 'REJECT';
    amount?: number;
    description?: string;
    ownerId?: string;
    type?: TransactionTypeValue;
    sourceAccountId?: string;
    destinationAccountId?: string;
    categoryId?: string;
};

export type InvestmentIncomePayload = {
    kind: 'SUKUK' | 'STOCK_GROWTH';
    amount: number;
    ownerId: string;
    destinationAccountId: string;
    description?: string;
    date?: string;
};

const DEFAULT_ACTIVITY_BY_TYPE: Record<TransactionTypeValue, string> = {
    INCOME: 'Pemasukan',
    EXPENSE: 'Pengeluaran',
    TRANSFER: 'Transfer',
    TOP_UP: 'Top Up',
    INVESTMENT_IN: 'Investasi Masuk',
    INVESTMENT_OUT: 'Investasi Keluar'
};

const DB_SAFE_TRANSFER_TYPES = ['TRANSFER'];

const toDbSafeTransactionType = (type: TransactionTypeValue): TransactionTypeValue =>
    type === 'TOP_UP' ? 'TRANSFER' : type;

const INVESTMENT_INCOME_ACTIVITY = {
    SUKUK: 'Pendapatan Sukuk',
    STOCK_GROWTH: 'Pertumbuhan Saham'
} as const;

const normalizeTransaction = (row: any): TransactionItem => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    description: row.description ?? undefined,
    date: row.date,
    isValidated: row.isValidated ?? row.is_validated ?? undefined,
    notificationInboxId: row.notificationInboxId ?? row.notification_inbox_id ?? null,
    ownerId: row.ownerId ?? row.owner_id ?? undefined,
    activityId: row.activityId ?? row.activity_id ?? row.activity?.id ?? undefined,
    sourceAccountId: row.sourceAccountId ?? row.source_account_id ?? undefined,
    destinationAccountId: row.destinationAccountId ?? row.destination_account_id ?? undefined,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : undefined,
    activity: row.activity ? { id: row.activity.id, name: row.activity.name } : undefined,
    sourceAccount: row.sourceAccount
        ? { id: row.sourceAccount.id, name: row.sourceAccount.name, type: row.sourceAccount.type }
        : undefined,
    destinationAccount: row.destinationAccount
        ? { id: row.destinationAccount.id, name: row.destinationAccount.name, type: row.destinationAccount.type }
        : undefined
});

const fetchTransactionsViaApi = async (options: FetchTransactionsOptions = {}): Promise<TransactionItem[]> => {
    const params = new URLSearchParams();
    if (typeof options.validated === 'boolean') params.set('validated', String(options.validated));
    if (typeof options.limit === 'number' && options.limit > 0) params.set('limit', String(options.limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/transactions${suffix}`);
    return (response.data || []).map(normalizeTransaction);
};

const fetchTransactionsViaSupabase = async (options: FetchTransactionsOptions = {}): Promise<TransactionItem[]> => {
    if (!supabase) return [];

    let query = supabase
        .from('Transaction')
        .select(`
            id,
            type,
            amount,
            description,
            date,
            isValidated,
            notificationInboxId,
            ownerId,
            activityId,
            sourceAccountId,
            destinationAccountId,
            owner:Owner(id, name),
            activity:Activity(id, name),
            sourceAccount:Account!Transaction_sourceAccountId_fkey(id, name, type),
            destinationAccount:Account!Transaction_destinationAccountId_fkey(id, name, type)
        `)
        .order('date', { ascending: false });

    if (typeof options.validated === 'boolean') {
        query = query.eq('isValidated', options.validated);
    }

    if (typeof options.limit === 'number' && options.limit > 0) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(normalizeTransaction);
};

const ensureSupabase = () => {
    if (!supabase) {
        throw new Error('Supabase belum terhubung');
    }

    return supabase;
};

const validatePayload = (payload: TransactionWritePayload) => {
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error('Jumlah transaksi harus lebih dari 0');
    }

    if (!payload.ownerId) {
        throw new Error('Pemilik wajib diisi');
    }

    if (payload.type === 'INCOME' && !payload.destinationAccountId) {
        throw new Error('Rekening tujuan wajib dipilih untuk pemasukan');
    }

    if ((payload.type === 'EXPENSE' || payload.type === 'INVESTMENT_OUT') && !payload.sourceAccountId) {
        throw new Error('Rekening sumber wajib dipilih untuk pengeluaran');
    }

    if (payload.type === 'TRANSFER' || payload.type === 'TOP_UP') {
        if (!payload.sourceAccountId || !payload.destinationAccountId) {
            throw new Error(`${payload.type === 'TOP_UP' ? 'Top up' : 'Transfer'} harus memiliki rekening sumber dan tujuan`);
        }

        if (payload.sourceAccountId === payload.destinationAccountId) {
            throw new Error(`Rekening sumber dan tujuan ${payload.type === 'TOP_UP' ? 'top up' : 'transfer'} tidak boleh sama`);
        }
    }
};

const ensureActivityId = async (activityId: string | undefined, type: TransactionTypeValue) => {
    const sb = ensureSupabase();

    if (activityId) return activityId;

    const name = DEFAULT_ACTIVITY_BY_TYPE[type];
    const { data: existing, error: findError } = await sb
        .from('Activity')
        .select('id, name')
        .eq('name', name)
        .limit(1)
        .maybeSingle();

    if (findError) throw findError;
    if (existing?.id) return existing.id;

    const timestamp = new Date().toISOString();
    const { data: created, error: createError } = await sb
        .from('Activity')
        .insert({
            id: crypto.randomUUID(),
            name,
            createdAt: timestamp,
            updatedAt: timestamp
        })
        .select('id')
        .single();

    if (createError) throw createError;
    return created.id;
};

const ensureNamedActivity = async (name: string) => {
    const sb = ensureSupabase();

    const { data: existing, error: findError } = await sb
        .from('Activity')
        .select('id, name')
        .eq('name', name)
        .limit(1)
        .maybeSingle();

    if (findError) throw findError;
    if (existing?.id) return existing.id;

    const timestamp = new Date().toISOString();
    const { data: created, error: createError } = await sb
        .from('Activity')
        .insert({
            id: crypto.randomUUID(),
            name,
            createdAt: timestamp,
            updatedAt: timestamp
        })
        .select('id')
        .single();

    if (createError) throw createError;
    return created.id;
};

const computeBalanceMap = async () => {
    const sb = ensureSupabase();

    const [{ data: accounts, error: accountsError }, { data: transactions, error: transactionsError }] = await Promise.all([
        sb.from('Account').select('id'),
        sb.from('Transaction').select('type, amount, sourceAccountId, destinationAccountId').eq('isValidated', true)
    ]);

    if (accountsError) throw accountsError;
    if (transactionsError) throw transactionsError;

    const balanceMap = new Map<string, number>();

    (accounts || []).forEach((account) => {
        balanceMap.set(account.id, 0);
    });

    (transactions || []).forEach((tx: any) => {
        const amount = Number(tx.amount ?? 0);
        if (!Number.isFinite(amount) || amount === 0) return;

        if ((tx.type === 'INCOME' || tx.type === 'INVESTMENT_IN') && tx.destinationAccountId) {
            balanceMap.set(tx.destinationAccountId, (balanceMap.get(tx.destinationAccountId) || 0) + amount);
        }

        if ((tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT') && tx.sourceAccountId) {
            balanceMap.set(tx.sourceAccountId, (balanceMap.get(tx.sourceAccountId) || 0) - amount);
        }

        if (DB_SAFE_TRANSFER_TYPES.includes(tx.type)) {
            if (tx.sourceAccountId) {
                balanceMap.set(tx.sourceAccountId, (balanceMap.get(tx.sourceAccountId) || 0) - amount);
            }

            if (tx.destinationAccountId) {
                balanceMap.set(tx.destinationAccountId, (balanceMap.get(tx.destinationAccountId) || 0) + amount);
            }
        }
    });

    return balanceMap;
};

const syncAccountBalancesDirect = async () => {
    const sb = ensureSupabase();
    const balanceMap = await computeBalanceMap();

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
};

const syncTargetsDirect = async () => {
    const sb = ensureSupabase();
    const [{ data: targets, error: targetsError }, { data: transactions, error: transactionsError }] = await Promise.all([
        sb.from('Target').select('id, ownerId, totalAmount, dueDate, createdAt').order('dueDate', { ascending: true }).order('createdAt', { ascending: true }),
        sb.from('Transaction').select('ownerId, type, amount').eq('isValidated', true).in('type', ['EXPENSE', 'INVESTMENT_OUT'])
    ]);

    if (targetsError) throw targetsError;
    if (transactionsError) throw transactionsError;

    const reductionByOwner = new Map<string, number>();
    (transactions || []).forEach((tx: any) => {
        const ownerId = String(tx.ownerId || '');
        if (!ownerId) return;
        reductionByOwner.set(ownerId, (reductionByOwner.get(ownerId) || 0) + Number(tx.amount || 0));
    });

    await Promise.all(
        (targets || []).map(async (target: any) => {
            const ownerId = String(target.ownerId || '');
            const remainingReduction = reductionByOwner.get(ownerId) || 0;
            const totalAmount = Number(target.totalAmount || 0);
            const nextRemaining = Math.max(0, totalAmount - remainingReduction);
            const reducedAmount = totalAmount - nextRemaining;

            reductionByOwner.set(ownerId, Math.max(0, remainingReduction - reducedAmount));

            const { error } = await sb
                .from('Target')
                .update({
                    remainingAmount: nextRemaining,
                    isActive: nextRemaining > 0,
                    updatedAt: new Date().toISOString()
                })
                .eq('id', target.id);

            if (error) throw error;
        })
    );
};

const syncDerivedDataDirect = async () => {
    await syncAccountBalancesDirect();
    await syncTargetsDirect();
};

const ensureSourceFunds = async (
    payload: TransactionWritePayload,
    excludeTransactionId?: string
) => {
    if (!supabase) return;

    const dbSafeType = toDbSafeTransactionType(payload.type);
    const needsSourceCheck = dbSafeType === 'EXPENSE'
        || dbSafeType === 'INVESTMENT_OUT'
        || dbSafeType === 'TRANSFER';

    if (!needsSourceCheck || !payload.sourceAccountId) return;

    const { data: account, error } = await ensureSupabase()
        .from('Account')
        .select('name, balance')
        .eq('id', payload.sourceAccountId)
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    let availableBalance = Number(account?.balance || 0);

    if (excludeTransactionId) {
        const { data: existingTx, error: existingTxError } = await ensureSupabase()
            .from('Transaction')
            .select('amount, sourceAccountId')
            .eq('id', excludeTransactionId)
            .limit(1)
            .maybeSingle();

        if (existingTxError) throw existingTxError;

        if (existingTx?.sourceAccountId === payload.sourceAccountId) {
            availableBalance += Number(existingTx.amount || 0);
        }
    }

    if (availableBalance < payload.amount) {
        throw new Error(
            `Saldo rekening ${account?.name || 'sumber'} tidak cukup ` +
            `(Hanya ada Rp ${new Intl.NumberFormat('id-ID').format(availableBalance)})`
        );
    }
};

const createTransactionDirect = async (payload: TransactionWritePayload): Promise<TransactionItem> => {
    validatePayload(payload);
    await ensureSourceFunds(payload);

    const dbSafeType = toDbSafeTransactionType(payload.type);
    const activityId = await ensureActivityId(payload.activityId, payload.type);
    const timestamp = new Date().toISOString();
    const insertPayload = {
        id: crypto.randomUUID(),
        amount: payload.amount,
        description: payload.description || null,
        ownerId: payload.ownerId,
        type: dbSafeType,
        activityId,
        sourceAccountId: payload.sourceAccountId || null,
        destinationAccountId: payload.destinationAccountId || null,
        notificationInboxId: payload.notificationInboxId || null,
        isValidated: true,
        date: payload.date || timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };

    const { data, error } = await ensureSupabase()
        .from('Transaction')
        .insert(insertPayload)
        .select(`
            id,
            type,
            amount,
            description,
            date,
            isValidated,
            notificationInboxId,
            ownerId,
            activityId,
            sourceAccountId,
            destinationAccountId
        `)
        .single();

    if (error) throw error;

    if (payload.notificationInboxId) {
        const { error: notificationError } = await ensureSupabase()
            .from('NotificationInbox')
            .update({
                parseStatus: 'PARSED',
                parsedType: dbSafeType,
                parsedAmount: payload.amount,
                updatedAt: new Date().toISOString()
            })
            .eq('id', payload.notificationInboxId);

        if (notificationError) throw notificationError;
    }

    await syncDerivedDataDirect();
    return normalizeTransaction(data);
};

const updateTransactionDirect = async (id: string, payload: TransactionWritePayload): Promise<TransactionItem> => {
    validatePayload(payload);
    await ensureSourceFunds(payload, id);
    const dbSafeType = toDbSafeTransactionType(payload.type);

    const { data: currentTx, error: currentTxError } = await ensureSupabase()
        .from('Transaction')
        .select('id, activityId')
        .eq('id', id)
        .limit(1)
        .maybeSingle();

    if (currentTxError) throw currentTxError;
    if (!currentTx?.id) throw new Error('Transaksi tidak ditemukan');

    const activityId = payload.activityId || currentTx.activityId || await ensureActivityId(undefined, payload.type);

    const { data, error } = await ensureSupabase()
        .from('Transaction')
        .update({
            amount: payload.amount,
            description: payload.description || null,
            ownerId: payload.ownerId,
            type: dbSafeType,
            activityId,
            sourceAccountId: payload.sourceAccountId || null,
            destinationAccountId: payload.destinationAccountId || null,
            updatedAt: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
            id,
            type,
            amount,
            description,
            date,
            isValidated,
            notificationInboxId,
            ownerId,
            activityId,
            sourceAccountId,
            destinationAccountId
        `)
        .single();

    if (error) throw error;

    await syncDerivedDataDirect();
    return normalizeTransaction(data);
};

const validateTransactionDirect = async (id: string, payload: ValidateTransactionPayload): Promise<TransactionItem | { message: string }> => {
    const sb = ensureSupabase();

    const { data: currentTx, error: currentTxError } = await sb
        .from('Transaction')
        .select('id, ownerId, activityId, notificationInboxId')
        .eq('id', id)
        .limit(1)
        .maybeSingle();

    if (currentTxError) throw currentTxError;
    if (!currentTx?.id) throw new Error('Transaksi tidak ditemukan');

    if (payload.action === 'REJECT') {
        if (currentTx.notificationInboxId) {
            const { error: notificationError } = await sb
                .from('NotificationInbox')
                .update({
                    parseStatus: 'IGNORED',
                    parseNotes: 'Transaksi ditolak dari antrean validasi',
                    updatedAt: new Date().toISOString()
                })
                .eq('id', currentTx.notificationInboxId);

            if (notificationError) throw notificationError;
        }

        const { error: deleteError } = await sb.from('Transaction').delete().eq('id', id);
        if (deleteError) throw deleteError;

        await syncDerivedDataDirect();
        return { message: 'Transaksi ditolak dan ditiadakan' };
    }

    const nextPayload: TransactionWritePayload = {
        amount: Number(payload.amount),
        description: payload.description,
        ownerId: payload.ownerId || currentTx.ownerId,
        type: payload.type || 'INCOME',
        sourceAccountId: payload.sourceAccountId,
        destinationAccountId: payload.destinationAccountId,
        activityId: payload.categoryId || currentTx.activityId || undefined
    };

    validatePayload(nextPayload);
    await ensureSourceFunds(nextPayload, id);

    const dbSafeType = toDbSafeTransactionType(nextPayload.type);
    const activityId = nextPayload.activityId || await ensureActivityId(undefined, nextPayload.type);
    const { data, error } = await sb
        .from('Transaction')
        .update({
            isValidated: true,
            amount: nextPayload.amount,
            description: nextPayload.description || null,
            ownerId: nextPayload.ownerId,
            type: dbSafeType,
            activityId,
            sourceAccountId: nextPayload.sourceAccountId || null,
            destinationAccountId: nextPayload.destinationAccountId || null,
            updatedAt: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
            id,
            type,
            amount,
            description,
            date,
            isValidated,
            notificationInboxId,
            ownerId,
            activityId,
            sourceAccountId,
            destinationAccountId
        `)
        .single();

    if (error) throw error;

    if (currentTx.notificationInboxId) {
        const { error: notificationError } = await sb
            .from('NotificationInbox')
            .update({
                parseStatus: 'PARSED',
                updatedAt: new Date().toISOString()
            })
            .eq('id', currentTx.notificationInboxId);

        if (notificationError) throw notificationError;
    }

    await syncDerivedDataDirect();
    return normalizeTransaction(data);
};

const deleteTransactionDirect = async (id: string): Promise<void> => {
    const { error } = await ensureSupabase().from('Transaction').delete().eq('id', id);
    if (error) throw error;
    await syncDerivedDataDirect();
};

const bulkDeleteTransactionsDirect = async (ids: string[]): Promise<void> => {
    const { error } = await ensureSupabase().from('Transaction').delete().in('id', ids);
    if (error) throw error;
    await syncDerivedDataDirect();
};

const createInvestmentIncomeDirect = async (payload: InvestmentIncomePayload): Promise<TransactionItem> => {
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error('Jumlah pemasukan investasi harus lebih dari 0');
    }

    if (!payload.ownerId || !payload.destinationAccountId) {
        throw new Error('Pemilik dan rekening investasi wajib dipilih');
    }

    const { data: destinationAccount, error: accountError } = await ensureSupabase()
        .from('Account')
        .select('id, name, type')
        .eq('id', payload.destinationAccountId)
        .limit(1)
        .maybeSingle();

    if (accountError) throw accountError;
    if (!destinationAccount?.id) throw new Error('Rekening tujuan tidak ditemukan');
    if (!['RDN', 'Sekuritas'].includes(destinationAccount.type)) {
        throw new Error('Pemasukan investasi hanya bisa dicatat ke rekening RDN atau Sekuritas');
    }

    const activityName = INVESTMENT_INCOME_ACTIVITY[payload.kind];
    const activityId = await ensureNamedActivity(activityName);
    const timestamp = new Date().toISOString();
    const { data, error } = await ensureSupabase()
        .from('Transaction')
        .insert({
            id: crypto.randomUUID(),
            type: 'INCOME',
            amount: payload.amount,
            description: (payload.description?.trim() || activityName).slice(0, 190),
            ownerId: payload.ownerId,
            activityId,
            destinationAccountId: payload.destinationAccountId,
            isValidated: true,
            date: payload.date || timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
        })
        .select(`
            id,
            type,
            amount,
            description,
            date,
            isValidated,
            notificationInboxId,
            ownerId,
            activityId,
            sourceAccountId,
            destinationAccountId
        `)
        .single();

    if (error) throw error;

    await syncDerivedDataDirect();
    return normalizeTransaction(data);
};

export const fetchTransactions = async (options: FetchTransactionsOptions = {}): Promise<TransactionItem[]> => {
    if (useDirectSupabaseData && supabase) {
        try {
            return await fetchTransactionsViaSupabase(options);
        } catch (error) {
            console.warn('Supabase transactions query failed, falling back to backend API.', error);
        }
    }

    return fetchTransactionsViaApi(options);
};

export const createTransaction = async (payload: TransactionWritePayload): Promise<TransactionItem> => {
    if (useDirectSupabaseData && supabase) {
        return createTransactionDirect(payload);
    }

    const response = await api.post('/transactions', payload);
    return normalizeTransaction(response.data);
};

export const updateTransaction = async (id: string, payload: TransactionWritePayload): Promise<TransactionItem> => {
    if (useDirectSupabaseData && supabase) {
        return updateTransactionDirect(id, payload);
    }

    const response = await api.put(`/transactions/${id}`, payload);
    return normalizeTransaction(response.data);
};

export const validateTransaction = async (id: string, payload: ValidateTransactionPayload): Promise<TransactionItem | { message: string }> => {
    if (useDirectSupabaseData && supabase) {
        return validateTransactionDirect(id, payload);
    }

    const response = await api.put(`/transactions/${id}/validate`, payload);
    return response.data;
};

export const deleteTransaction = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        return deleteTransactionDirect(id);
    }

    await api.delete(`/transactions/${id}`);
};

export const bulkDeleteTransactions = async (ids: string[]): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        return bulkDeleteTransactionsDirect(ids);
    }

    await api.post('/transactions/bulk-delete', { ids });
};

export const createInvestmentIncome = async (payload: InvestmentIncomePayload): Promise<TransactionItem> => {
    if (useDirectSupabaseData && supabase) {
        return createInvestmentIncomeDirect(payload);
    }

    const response = await api.post('/transactions/investment-income', payload);
    return normalizeTransaction(response.data);
};
