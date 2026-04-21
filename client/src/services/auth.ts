import { fetchMasterMeta } from './masterData';

export const normalizeIdentifierToEmail = (identifier: string) => {
    const raw = identifier.trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw.toLowerCase();

    const digits = raw.replace(/[^0-9]/g, '');
    return digits ? `${digits}@app.local` : '';
};

export const resolvePostAuthPath = async () => {
    try {
        const meta = await fetchMasterMeta();
        const hasSetup = meta.owners.length > 0 || meta.accounts.length > 0 || meta.activities.length > 0;
        return hasSetup ? '/' : '/menu?setup=1';
    } catch (error) {
        console.error('Failed to resolve post-auth path:', error);
        return '/menu?setup=1';
    }
};
