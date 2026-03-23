import api from './api';

export type BackupFrequency = 'manual' | 'daily' | 'weekly';

export type BackupSettings = {
    autoBackup: boolean;
    frequency: BackupFrequency;
    includeNotifications: boolean;
    lastBackupAt: string | null;
};

const BACKUP_SETTINGS_KEY = 'nova-backup-settings';

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
    autoBackup: false,
    frequency: 'weekly',
    includeNotifications: true,
    lastBackupAt: null
};

export const loadBackupSettings = (): BackupSettings => {
    if (typeof window === 'undefined') return DEFAULT_BACKUP_SETTINGS;

    try {
        const raw = window.localStorage.getItem(BACKUP_SETTINGS_KEY);
        if (!raw) return DEFAULT_BACKUP_SETTINGS;

        const parsed = JSON.parse(raw) as Partial<BackupSettings>;
        return {
            autoBackup: Boolean(parsed.autoBackup),
            frequency: parsed.frequency === 'daily' || parsed.frequency === 'weekly' ? parsed.frequency : 'manual',
            includeNotifications: parsed.includeNotifications ?? true,
            lastBackupAt: parsed.lastBackupAt ?? null
        };
    } catch {
        return DEFAULT_BACKUP_SETTINGS;
    }
};

export const saveBackupSettings = (settings: BackupSettings) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings));
};

export const shouldRunAutoBackup = (settings: BackupSettings, now = new Date()) => {
    if (!settings.autoBackup || settings.frequency === 'manual') return false;
    if (!settings.lastBackupAt) return true;

    const lastBackup = new Date(settings.lastBackupAt);
    if (Number.isNaN(lastBackup.getTime())) return true;

    const diffMs = now.getTime() - lastBackup.getTime();
    const intervalMs = settings.frequency === 'daily'
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

    return diffMs >= intervalMs;
};

export const buildBackupFilename = (date = new Date()) => {
    const iso = date.toISOString().replace(/[:.]/g, '-');
    return `nova-backup-${iso}.json`;
};

export const downloadBackupBlob = (blob: Blob, filename: string) => {
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
};

export const exportBackupJson = async (includeNotifications: boolean) => {
    const response = await api.get('/master/export-backup', {
        responseType: 'blob',
        params: {
            includeNotifications: includeNotifications ? '1' : '0'
        }
    });

    return response.data as Blob;
};

export const restoreBackupJson = async (payload: unknown) => {
    const response = await api.post('/master/restore-backup', payload);
    return response.data;
};
