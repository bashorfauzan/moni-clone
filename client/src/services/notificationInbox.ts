import api from './api';
import { hasSupabaseEnv, supabase } from '../lib/supabase';

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
    parsedAccountHint: row.parsedAccountHint ?? row.parsed_account_hint ?? undefined,
    parseNotes: row.parseNotes ?? row.parse_notes ?? undefined,
    confidenceScore: row.confidenceScore ?? row.confidence_score ?? undefined,
    transaction: row.transaction ? { 
        id: row.transaction.id, 
        isValidated: row.transaction.isValidated ?? row.transaction.is_validated 
    } : null
});

export const fetchNotificationInbox = async (limit = 8): Promise<NotificationItem[]> => {
    if (hasSupabaseEnv && supabase) {
        const { data, error } = await supabase
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
                parsedAccountHint,
                parseNotes,
                confidenceScore,
                transaction:Transaction(id, isValidated)
            `)
            .neq('parseStatus', 'IGNORED')
            .order('receivedAt', { ascending: false })
            .limit(limit);

        if (!error && Array.isArray(data)) {
            return data.map(normalizeNotificationRow);
        }

        console.warn('Supabase notification query failed, falling back to backend API.', error);
    }

    const response = await api.get(`/webhook/notifications?limit=${limit}`);
    return response.data.map(normalizeNotificationRow);
};

export const deleteNotificationInboxItem = async (id: string) => {
    await api.delete(`/webhook/notifications/${id}`);
};

export const clearNotificationInbox = async () => {
    await api.delete('/webhook/notifications');
};
