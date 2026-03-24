import api from './api';
import { supabase, hasSupabaseEnv } from '../lib/supabase';

export type TargetItem = {
    id: string;
    title: string;
    totalAmount: number;
    remainingAmount: number;
    period: 'YEARLY' | 'FIVE_YEAR';
    isActive: boolean;
    dueDate?: string | null;
    createdAt?: string;
    ownerId: string;
    owner?: { id: string; name: string };
};

export type TargetsResponse = {
    targets: TargetItem[];
    summary: { activeRemaining: number };
};

const normalizeTarget = (row: any): TargetItem => ({
    id: row.id,
    title: row.title,
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
    remainingAmount: Number(row.remainingAmount ?? row.remaining_amount ?? 0),
    period: row.period,
    isActive: Boolean(row.isActive ?? row.is_active),
    dueDate: row.dueDate ?? row.due_date ?? null,
    createdAt: row.createdAt ?? row.created_at ?? undefined,
    ownerId: row.ownerId ?? row.owner_id,
    owner: row.owner
        ? { id: row.owner.id, name: row.owner.name }
        : undefined
});

export const fetchTargets = async (): Promise<TargetsResponse> => {
    if (hasSupabaseEnv && supabase) {
        const { data, error } = await supabase
            .from('Target')
            .select(`
                id,
                title,
                totalAmount,
                remainingAmount,
                period,
                isActive,
                dueDate,
                createdAt,
                ownerId,
                owner:Owner(id, name)
            `)
            .order('isActive', { ascending: false })
            .order('createdAt', { ascending: false });

        if (!error && Array.isArray(data)) {
            const targets = data.map(normalizeTarget);
            return {
                targets,
                summary: {
                    activeRemaining: targets
                        .filter((target) => target.isActive)
                        .reduce((sum, target) => sum + target.remainingAmount, 0)
                }
            };
        }

        console.warn('Supabase targets query failed, falling back to backend API.', error);
    }

    const response = await api.get('/targets');
    return {
        targets: (response.data.targets || []).map(normalizeTarget),
        summary: {
            activeRemaining: Number(response.data.summary?.activeRemaining || 0)
        }
    };
};
