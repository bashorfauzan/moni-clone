import api from './api';
import { hasSupabaseEnv, supabase } from '../lib/supabase';

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
    if (hasSupabaseEnv && supabase) {
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
