import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';

export type TransactionItem = {
    id: string;
    type: string;
    amount: number;
    description?: string;
    date: string;
    isValidated?: boolean;
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

const normalizeTransaction = (row: any): TransactionItem => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    description: row.description ?? undefined,
    date: row.date,
    isValidated: row.isValidated ?? row.is_validated ?? undefined,
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

export const fetchTransactions = async (options: FetchTransactionsOptions = {}): Promise<TransactionItem[]> => {
    const { validated, limit } = options;

    if (useDirectSupabaseData && supabase) {
        let query = supabase
            .from('Transaction')
            .select(`
                id,
                type,
                amount,
                description,
                date,
                isValidated,
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

        if (typeof validated === 'boolean') {
            query = query.eq('isValidated', validated);
        }

        if (typeof limit === 'number' && limit > 0) {
            query = query.limit(limit);
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
            return data.map(normalizeTransaction);
        }

        console.warn('Supabase transactions query failed, falling back to backend API.', error);
    }

    const params = new URLSearchParams();
    if (typeof validated === 'boolean') params.set('validated', String(validated));
    if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/transactions${suffix}`);
    return (response.data || []).map(normalizeTransaction);
};

export const deleteTransaction = async (id: string): Promise<void> => {
    await api.delete(`/transactions/${id}`);
};
