const getStorage = (kind: 'local' | 'session'): Storage | undefined => {
    if (typeof window === 'undefined') return undefined;

    try {
        return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
        return undefined;
    }
};

export const readStorage = (key: string, fallback: string | null = null, kind: 'local' | 'session' = 'local'): string | null => {
    const storage = getStorage(kind);
    if (!storage) return fallback;

    try {
        const value = storage.getItem(key);
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

export const writeStorage = (key: string, value: string, kind: 'local' | 'session' = 'local'): boolean => {
    const storage = getStorage(kind);
    if (!storage) return false;

    try {
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

export const removeStorage = (key: string, kind: 'local' | 'session' = 'local') => {
    const storage = getStorage(kind);
    if (!storage) return;

    try {
        storage.removeItem(key);
    } catch {
        // Abaikan agar UI tidak crash saat storage diblokir browser/WebView.
    }
};

export const readNumberStorage = (key: string, fallback: number, kind: 'local' | 'session' = 'local') => {
    const raw = readStorage(key, null, kind);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
};
