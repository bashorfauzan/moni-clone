import api from './api';
import { supabase, useDirectSupabaseData } from '../lib/supabase';
import { recordDataAccessMode } from './dataAccessMode';
import { getErrorMessage } from './errors';

export type TargetItem = {
    id: string;
    title: string;
    totalAmount: number;
    remainingAmount: number;
    period: 'YEARLY' | 'FIVE_YEAR';
    isActive: boolean;
    lastContributionAt?: string | null;
    dueDate?: string | null;
    createdAt?: string;
    ownerId: string;
    owner?: { id: string; name: string };
};

export type TargetsResponse = {
    targets: TargetItem[];
    summary: { activeRemaining: number };
};

export type TargetContributionResult = {
    target: TargetItem;
    appliedAmount: number;
};

export type TargetWritePayload = {
    title: string;
    totalAmount: number;
    monthCount: number;
    ownerId?: string;
};

let supportsLastContributionAt: boolean | null = null;

const ensureSupabase = () => {
    if (!supabase) {
        throw new Error('Supabase belum terhubung');
    }

    return supabase;
};

const parseMonthCount = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
};

const monthCountToPeriod = (monthCount: number): string => {
    if (monthCount <= 1) return 'ONE_MONTH';
    if (monthCount <= 3) return 'THREE_MONTH';
    if (monthCount <= 6) return 'SIX_MONTH';
    if (monthCount <= 12) return 'YEARLY';
    if (monthCount <= 36) return 'THREE_YEAR';
    return 'FIVE_YEAR';
};

const dueDateFromMonthCount = (monthCount: number, baseDate = new Date()) => {
    const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthCount, 0);
    dueDate.setHours(23, 59, 59, 999);
    return dueDate.toISOString();
};

const diffInCalendarMonthsInclusive = (startValue?: string | null, endValue?: string | null) => {
    if (!startValue || !endValue) return null;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const months = ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
};

const getSuggestedContributionAmount = (target: Pick<TargetItem, 'totalAmount' | 'remainingAmount' | 'createdAt' | 'dueDate'>) => {
    if (target.remainingAmount <= 0) return 0;
    const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
    const rawInstallment = Math.ceil(target.totalAmount / totalMonths);
    return Math.max(0, Math.min(target.remainingAmount, rawInstallment));
};

const targetSelectFields = (includeLastContributionAt: boolean) => `
    id,
    title,
    totalAmount,
    remainingAmount,
    period,
    isActive,
    ${includeLastContributionAt ? 'lastContributionAt,' : ''}
    dueDate,
    createdAt,
    ownerId,
    owner:Owner(id, name)
`;

const isMissingLastContributionColumnError = (error: unknown) => {
    const message = getErrorMessage(error, '').toLowerCase();
    return message.includes('lastcontributionat') && (
        message.includes('does not exist')
        || message.includes('column')
        || message.includes('schema cache')
    );
};

const withTargetSelectFallback = async <T>(runner: (includeLastContributionAt: boolean) => Promise<T>) => {
    const preferred = supportsLastContributionAt !== false;

    try {
        const result = await runner(preferred);
        if (preferred) supportsLastContributionAt = true;
        return result;
    } catch (error) {
        if (!preferred || !isMissingLastContributionColumnError(error)) {
            throw error;
        }

        supportsLastContributionAt = false;
        return runner(false);
    }
};

const normalizeTarget = (row: any): TargetItem => ({
    id: row.id,
    title: row.title,
    totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
    remainingAmount: Number(row.remainingAmount ?? row.remaining_amount ?? 0),
    period: row.period,
    isActive: Boolean(row.isActive ?? row.is_active),
    lastContributionAt: row.lastContributionAt ?? row.last_contribution_at ?? null,
    dueDate: row.dueDate ?? row.due_date ?? null,
    createdAt: row.createdAt ?? row.created_at ?? undefined,
    ownerId: row.ownerId ?? row.owner_id,
    owner: row.owner
        ? { id: row.owner.id, name: row.owner.name }
        : undefined
});

export const fetchTargets = async (): Promise<TargetsResponse> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data, error } = await withTargetSelectFallback(async (includeLastContributionAt) =>
            sb
                .from('Target')
                .select(targetSelectFields(includeLastContributionAt))
                .order('isActive', { ascending: false })
                .order('createdAt', { ascending: false })
        );

        if (!error && Array.isArray(data)) {
            recordDataAccessMode('targets', 'direct-supabase', 'Target berhasil dibaca langsung dari Supabase.');
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
        recordDataAccessMode('targets', 'supabase-fallback-to-api', getErrorMessage(error, 'Query target fallback ke backend API.'));
    }

    const response = await api.get('/targets');
    recordDataAccessMode('targets', 'backend-api', 'Target dibaca lewat backend API.');
    return {
        targets: (response.data.targets || []).map(normalizeTarget),
        summary: {
            activeRemaining: Number(response.data.summary?.activeRemaining || 0)
        }
    };
};

export const createTarget = async (payload: TargetWritePayload): Promise<TargetItem> => {
    const parsedMonthCount = parseMonthCount(payload.monthCount);
    if (!parsedMonthCount) throw new Error('Jumlah bulan target tidak valid');

    if (useDirectSupabaseData && supabase) {
        const timestamp = new Date().toISOString();
        const { data, error } = await withTargetSelectFallback(async (includeLastContributionAt) =>
            ensureSupabase()
                .from('Target')
                .insert({
                    id: crypto.randomUUID(),
                    title: payload.title.trim(),
                    totalAmount: payload.totalAmount,
                    remainingAmount: payload.totalAmount,
                    period: monthCountToPeriod(parsedMonthCount),
                    ownerId: payload.ownerId,
                    dueDate: dueDateFromMonthCount(parsedMonthCount),
                    isActive: true,
                    createdAt: timestamp,
                    updatedAt: timestamp
                })
                .select(targetSelectFields(includeLastContributionAt))
                .single()
        );

        if (error) throw error;
        recordDataAccessMode('targets', 'direct-supabase', 'Create target berhasil langsung ke Supabase.');
        return normalizeTarget(data);
    }

    const response = await api.post('/targets', payload);
    recordDataAccessMode('targets', 'backend-api', 'Create target berhasil lewat backend API.');
    return normalizeTarget(response.data);
};

export const updateTarget = async (id: string, payload: TargetWritePayload): Promise<TargetItem> => {
    const parsedMonthCount = parseMonthCount(payload.monthCount);
    if (!parsedMonthCount) throw new Error('Jumlah bulan target tidak valid');

    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data: current, error: currentError } = await sb
            .from('Target')
            .select('totalAmount, remainingAmount, createdAt')
            .eq('id', id)
            .limit(1)
            .maybeSingle();

        if (currentError) throw currentError;
        if (!current) throw new Error('Target tidak ditemukan');

        const completedAmount = Math.max(0, Number(current.totalAmount || 0) - Number(current.remainingAmount || 0));
        const nextRemaining = Math.max(0, payload.totalAmount - completedAmount);

        const { data, error } = await withTargetSelectFallback(async (includeLastContributionAt) =>
            sb
                .from('Target')
                .update({
                    title: payload.title.trim(),
                    totalAmount: payload.totalAmount,
                    remainingAmount: nextRemaining,
                    isActive: nextRemaining > 0,
                    period: monthCountToPeriod(parsedMonthCount),
                    dueDate: dueDateFromMonthCount(parsedMonthCount, current.createdAt ? new Date(current.createdAt) : new Date()),
                    updatedAt: new Date().toISOString()
                })
                .eq('id', id)
                .select(targetSelectFields(includeLastContributionAt))
                .single()
        );

        if (error) throw error;
        recordDataAccessMode('targets', 'direct-supabase', 'Update target berhasil langsung ke Supabase.');
        return normalizeTarget(data);
    }

    const response = await api.put(`/targets/${id}`, payload);
    recordDataAccessMode('targets', 'backend-api', 'Update target berhasil lewat backend API.');
    return normalizeTarget(response.data);
};

export const deleteTarget = async (id: string): Promise<void> => {
    if (useDirectSupabaseData && supabase) {
        const { error } = await ensureSupabase().from('Target').delete().eq('id', id);
        if (error) throw error;
        recordDataAccessMode('targets', 'direct-supabase', 'Hapus target berhasil langsung di Supabase.');
        return;
    }

    await api.delete(`/targets/${id}`);
    recordDataAccessMode('targets', 'backend-api', 'Hapus target berhasil lewat backend API.');
};

export const markTargetAsTransferred = async (id: string): Promise<TargetContributionResult> => {
    if (useDirectSupabaseData && supabase) {
        const sb = ensureSupabase();
        const { data: current, error: currentError } = await withTargetSelectFallback(async (includeLastContributionAt) =>
            sb
                .from('Target')
                .select(targetSelectFields(includeLastContributionAt))
                .eq('id', id)
                .limit(1)
                .maybeSingle()
        );

        if (currentError) throw currentError;
        if (!current) throw new Error('Target tidak ditemukan');

        const normalizedCurrent = normalizeTarget(current);
        if (!normalizedCurrent.isActive || normalizedCurrent.remainingAmount <= 0) {
            throw new Error('Target ini sudah selesai');
        }

        const now = new Date();
        const lastContributionAt = normalizedCurrent.lastContributionAt ? new Date(normalizedCurrent.lastContributionAt) : null;
        const alreadyMarkedThisMonth = lastContributionAt
            && lastContributionAt.getFullYear() === now.getFullYear()
            && lastContributionAt.getMonth() === now.getMonth();

        if (alreadyMarkedThisMonth) {
            throw new Error('Setoran target bulan ini sudah ditandai');
        }

        const appliedAmount = getSuggestedContributionAmount(normalizedCurrent);
        const nextRemaining = Math.max(0, normalizedCurrent.remainingAmount - appliedAmount);

        const updatePayload: Record<string, unknown> = {
            remainingAmount: nextRemaining,
            isActive: nextRemaining > 0,
            updatedAt: now.toISOString()
        };
        if (supportsLastContributionAt !== false) {
            updatePayload.lastContributionAt = now.toISOString();
        }

        const { data, error } = await withTargetSelectFallback(async (includeLastContributionAt) =>
            sb
                .from('Target')
                .update(includeLastContributionAt ? updatePayload : {
                    remainingAmount: nextRemaining,
                    isActive: nextRemaining > 0,
                    updatedAt: now.toISOString()
                })
                .eq('id', id)
                .select(targetSelectFields(includeLastContributionAt))
                .single()
        );

        if (error) throw error;
        recordDataAccessMode('targets', 'direct-supabase', 'Setoran target berhasil diproses langsung di Supabase.');
        return {
            target: normalizeTarget(data),
            appliedAmount
        };
    }

    const response = await api.post(`/targets/${id}/mark-progress`);
    recordDataAccessMode('targets', 'backend-api', 'Setoran target berhasil diproses lewat backend API.');
    return {
        target: normalizeTarget(response.data.target),
        appliedAmount: Number(response.data.appliedAmount || 0)
    };
};
