import api from './api';
import { recordDataAccessMode } from './dataAccessMode';
import { getErrorMessage } from './errors';
import { supabase, useDirectSupabaseData } from '../lib/supabase';

export type NotificationItem = {
    id: string;
    sourceApp: string;
    title?: string;
    senderName?: string;
    messageText: string;
    receivedAt: string;
    parseStatus: 'PENDING' | 'PARSED' | 'IGNORED' | 'FAILED';
    parsedType?: string;
    parsedAmount?: number;
    parsedDescription?: string;
    parsedAccountHint?: string;
    parseNotes?: string;
    confidenceScore?: number;
    transaction?: { id: string; isValidated: boolean } | null;
};

const normalizeNotificationRow = (row: any): NotificationItem => ({
    id: row.id,
    sourceApp: row.sourceApp ?? row.source_app,
    title: row.title ?? undefined,
    senderName: row.senderName ?? row.sender_name ?? undefined,
    messageText: row.messageText ?? row.message_text,
    receivedAt: row.receivedAt ?? row.received_at,
    parseStatus: row.parseStatus ?? row.parse_status,
    parsedType: row.parsedType ?? row.parsed_type ?? undefined,
    parsedAmount: row.parsedAmount ?? row.parsed_amount ?? undefined,
    parsedDescription: row.parsedDescription ?? row.parsed_description ?? undefined,
    parsedAccountHint: row.parsedAccountHint ?? row.parsed_account_hint ?? undefined,
    parseNotes: row.parseNotes ?? row.parse_notes ?? undefined,
    confidenceScore: row.confidenceScore ?? row.confidence_score ?? undefined,
    transaction: row.transaction ? { 
        id: row.transaction.id, 
        isValidated: row.transaction.isValidated ?? row.transaction.is_validated 
    } : null
});

const fetchNotificationInboxViaSupabase = async (limit = 8): Promise<NotificationItem[]> => {
    if (!supabase) return [];

    const { data: notifications, error } = await supabase
        .from('NotificationInbox')
        .select(`
            id,
            sourceApp,
            title,
            senderName,
            messageText,
            receivedAt,
            parseStatus,
            parsedType,
            parsedAmount,
            parsedDescription,
            parsedAccountHint,
            parseNotes,
            confidenceScore
        `)
        .neq('parseStatus', 'IGNORED')
        .order('receivedAt', { ascending: false })
        .limit(limit);

    if (error) throw error;

    const notificationIds = (notifications || []).map((item) => item.id);
    const transactionMap = new Map<string, { id: string; isValidated: boolean }>();

    if (notificationIds.length > 0) {
        const { data: transactions, error: transactionError } = await supabase
            .from('Transaction')
            .select('id, isValidated, notificationInboxId')
            .in('notificationInboxId', notificationIds);

        if (transactionError) throw transactionError;

        for (const tx of transactions || []) {
            const notificationInboxId = tx.notificationInboxId;
            if (!notificationInboxId) continue;
            transactionMap.set(notificationInboxId, {
                id: tx.id,
                isValidated: Boolean(tx.isValidated)
            });
        }
    }

    recordDataAccessMode('notifications', 'direct-supabase', 'Inbox notifikasi berhasil dibaca langsung dari Supabase.');
    return (notifications || []).map((row) => normalizeNotificationRow({
        ...row,
        transaction: transactionMap.get(row.id) ?? null
    }));
};

export const fetchNotificationInbox = async (limit = 8): Promise<NotificationItem[]> => {
    if (useDirectSupabaseData && supabase) {
        try {
            return await fetchNotificationInboxViaSupabase(limit);
        } catch (error) {
            recordDataAccessMode(
                'notifications',
                'supabase-fallback-to-api',
                getErrorMessage(error, 'Query Supabase inbox notifikasi gagal, fallback ke backend API.')
            );
        }
    }

    const response = await api.get(`/webhook/notifications?limit=${limit}`);
    recordDataAccessMode('notifications', 'backend-api', 'Inbox notifikasi dibaca lewat backend API.');
    return response.data.map(normalizeNotificationRow);
};

export const deleteNotificationInboxItem = async (id: string) => {
    await api.delete(`/webhook/notifications/${id}`);
    recordDataAccessMode('notifications', 'backend-api', 'Hapus item inbox notifikasi lewat backend API.');
};

export const clearNotificationInbox = async () => {
    await api.delete('/webhook/notifications');
    recordDataAccessMode('notifications', 'backend-api', 'Kosongkan inbox notifikasi lewat backend API.');
};
