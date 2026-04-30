export type DataAccessModule = 'master' | 'transactions' | 'targets' | 'notifications';
export type DataAccessMode = 'backend-api' | 'direct-supabase' | 'supabase-fallback-to-api';

export type DataAccessSnapshot = {
    module: DataAccessModule;
    mode: DataAccessMode;
    detail: string;
    updatedAt: string;
};

const STORAGE_KEY = 'moni-data-access-snapshots';

const runtimeSnapshots = new Map<DataAccessModule, DataAccessSnapshot>();

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readStoredSnapshots = (): Partial<Record<DataAccessModule, DataAccessSnapshot>> => {
    if (!canUseStorage()) return {};

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<Record<DataAccessModule, DataAccessSnapshot>>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const persistSnapshots = () => {
    if (!canUseStorage()) return;

    try {
        const payload = Object.fromEntries(runtimeSnapshots.entries());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Abaikan kegagalan penyimpanan lokal agar alur data utama tidak terganggu.
    }
};

export const recordDataAccessMode = (
    module: DataAccessModule,
    mode: DataAccessMode,
    detail: string
) => {
    runtimeSnapshots.set(module, {
        module,
        mode,
        detail,
        updatedAt: new Date().toISOString()
    });

    persistSnapshots();
};

export const getDataAccessSnapshot = (module: DataAccessModule): DataAccessSnapshot | null => {
    const runtimeValue = runtimeSnapshots.get(module);
    if (runtimeValue) return runtimeValue;

    const storedValue = readStoredSnapshots()[module];
    return storedValue || null;
};

export const getAllDataAccessSnapshots = (): DataAccessSnapshot[] => {
    const stored = readStoredSnapshots();
    const merged = new Map<DataAccessModule, DataAccessSnapshot>();

    (Object.values(stored) as DataAccessSnapshot[]).forEach((snapshot) => {
        if (snapshot?.module) merged.set(snapshot.module, snapshot);
    });

    runtimeSnapshots.forEach((snapshot, key) => {
        merged.set(key, snapshot);
    });

    return Array.from(merged.values()).sort((a, b) => a.module.localeCompare(b.module));
};
