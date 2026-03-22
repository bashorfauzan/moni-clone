import { hasSupabaseEnv, supabase } from '../lib/supabase';

export const subscribeTableChanges = (
    channelName: string,
    table: string,
    onChange: () => void
) => {
    const client = supabase;

    if (!hasSupabaseEnv || !client) {
        return () => undefined;
    }

    const channel = client
        .channel(channelName)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => onChange()
        )
        .subscribe();

    return () => {
        void client.removeChannel(channel);
    };
};
