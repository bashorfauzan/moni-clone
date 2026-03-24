import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';

export type Owner = { id: string; name: string };
export type Account = {
    id: string;
    name: string;
    type: string;
    accountNumber?: string | null;
    appPackageName?: string | null;
    appDeepLink?: string | null;
    appStoreUrl?: string | null;
    balance: number;
    ownerId: string;
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
    ownerId: string;
    accountNumber?: string | null;
    appPackageName?: string | null;
    appDeepLink?: string | null;
    appStoreUrl?: string | null;
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
    balance: Number(row.balance ?? 0),
    ownerId: row.ownerId ?? row.owner_id
});

const normalizeActivity = (row: any): Activity => ({
    id: row.id,
    name: row.name
});

export const fetchMasterMeta = async (): Promise<MasterMeta> => {
    if (useDirectSupabaseData && supabase) {
        const [ownersRes, accountsRes, activitiesRes] = await Promise.all([
            supabase.from('Owner').select('id, name').order('createdAt', { ascending: true }),
            supabase.from('Account').select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, balance, ownerId').order('createdAt', { ascending: false }),
            supabase.from('Activity').select('id, name').order('createdAt', { ascending: false })
        ]);

        if (!ownersRes.error && !accountsRes.error && !activitiesRes.error) {
            return {
                owners: (ownersRes.data || []).map(normalizeOwner),
                accounts: (accountsRes.data || []).map(normalizeAccount),
                activities: (activitiesRes.data || []).map(normalizeActivity)
            };
        }

        console.warn('Supabase master meta query failed, falling back to backend API.', {
            ownersError: ownersRes.error,
            accountsError: accountsRes.error,
            activitiesError: activitiesRes.error
        });
    }

    const response = await api.get('/master/meta');
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
            .select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, balance, ownerId')
            .single();

        if (!error && data) return normalizeAccount(data);
        console.warn('Supabase account create failed, falling back to backend API.', error);
    }

    const response = await api.post('/master/accounts', payload);
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
            .select('id, name, type, accountNumber, appPackageName, appDeepLink, appStoreUrl, balance, ownerId')
            .single();

        if (!error && data) return normalizeAccount(data);
        console.warn('Supabase account update failed, falling back to backend API.', error);
    }

    const response = await api.put(`/master/accounts/${id}`, payload);
    return normalizeAccount(response.data);
};

export const deleteAccount = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Account').delete().eq('id', id);
        if (!error) return;
        console.warn('Supabase account delete failed, falling back to backend API.', error);
    }

    await api.delete(`/master/accounts/${id}`);
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

        if (!error && data) return normalizeActivity(data);
        console.warn('Supabase activity create failed, falling back to backend API.', error);
    }

    const response = await api.post('/master/activities', { name });
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

        if (!error && data) return normalizeActivity(data);
        console.warn('Supabase activity update failed, falling back to backend API.', error);
    }

    const response = await api.put(`/master/activities/${id}`, { name });
    return normalizeActivity(response.data);
};

export const deleteActivity = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Activity').delete().eq('id', id);
        if (!error) return;
        console.warn('Supabase activity delete failed, falling back to backend API.', error);
    }

    await api.delete(`/master/activities/${id}`);
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

        if (!error && data) return normalizeOwner(data);
        console.warn('Supabase owner create failed, falling back to backend API.', error);
    }

    const response = await api.post('/master/owners', { name });
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

        if (!error && data) return normalizeOwner(data);
        console.warn('Supabase owner update failed, falling back to backend API.', error);
    }

    const response = await api.put(`/master/owners/${id}`, { name });
    return normalizeOwner(response.data);
};

export const deleteOwner = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await supabase.from('Owner').delete().eq('id', id);
        if (!error) return;
        console.warn('Supabase owner delete failed, falling back to backend API.', error);
    }

    await api.delete(`/master/owners/${id}`);
};
