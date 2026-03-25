import { useState, useEffect } from 'react';
import api from '../services/api';
import {
    User,
    Wallet,
    Settings,
    Shield,
    LogOut,
    ChevronRight,
    CreditCard,
    Smartphone,
    TrendingUp,
    Palette,
    Plus,
    Pencil,
    Trash2,
    X,
    Save,
    Tag,
    Search,
    ChevronLeft,
    Download,
    ExternalLink,
    Mail,
    Lock,
    Phone
} from 'lucide-react';
import { useTheme, THEME_PRESETS } from '../context/ThemeContext';
import {
    createAccount,
    createActivity,
    createOwner,
    deleteAccount as removeAccount,
    deleteActivity as removeActivity,
    deleteOwner as removeOwner,
    fetchMasterMeta,
    type Owner,
    type Account,
    type Activity,
    updateAccount,
    updateActivity,
    updateOwner
} from '../services/masterData';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSecurity } from '../context/SecurityContext';
import {
    buildBackupFilename,
    downloadBackupBlob,
    exportBackupJson,
    loadBackupSettings,
    restoreBackupJson,
    saveBackupSettings,
    shouldRunAutoBackup,
    type BackupSettings
} from '../services/backup';
import {
    ACCOUNT_APP_PRESETS,
    canLaunchAccountApp,
    launchAccountApp
} from '../services/accountLauncher';
import { supabase } from '../lib/supabase';
import Spinner from '../components/Spinner';

const ACCOUNT_TYPES = ['Bank', 'E-Wallet', 'RDN', 'Sekuritas'];
const PAGE_SIZE = 6;
const DEFAULT_RESET_OPTIONS = {
    transactions: true,
    targets: true,
    categories: false,
    accounts: false,
    owners: false
};

type RestorePreview = {
    fileName: string;
    exportedAt?: string | null;
    includeNotifications?: boolean;
    counts: Record<string, number>;
    payload: unknown;
};

const MenuPage = () => {
    const [meta, setMeta] = useState<{ owners: Owner[]; accounts: Account[]; activities: Activity[] }>({ owners: [], accounts: [], activities: [] });
    const location = useLocation();
    const navigate = useNavigate();
    const { signOut, user } = useAuth();
    const { bgColor, bgImage, heroColor, heroCardImage, bgOverlay, bgBlur, heroImageMode, appScale, setBgColor, setBgImage, setHeroColor, setHeroCardImage, setBgOverlay, setBgBlur, setHeroImageMode, setAppScale } = useTheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Account Manager
    const [accountForm, setAccountForm] = useState({
        name: '',
        type: 'Bank',
        accountNumber: '',
        balance: '',
        ownerId: '',
        appPackageName: '',
        appDeepLink: '',
        appStoreUrl: ''
    });
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
    const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<string | null>(null);
    const [showAccountForm, setShowAccountForm] = useState(false);

    // Activity Manager
    const [activityForm, setActivityForm] = useState({ name: '' });
    const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
    const [isActivityManagerOpen, setIsActivityManagerOpen] = useState(false);
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<string | null>(null);

    // Pagination / search
    const [accountQuery, setAccountQuery] = useState('');
    const [activityQuery, setActivityQuery] = useState('');
    const [ownerQuery, setOwnerQuery] = useState('');
    const [accountPage, setAccountPage] = useState(1);
    const [activityPage, setActivityPage] = useState(1);
    const [resetDataLoading, setResetDataLoading] = useState(false);
    const [themeImageError, setThemeImageError] = useState('');
    const [heroThemeImageError, setHeroThemeImageError] = useState('');
    const [isThemeCustomizerOpen, setIsThemeCustomizerOpen] = useState(false);
    const [isBackupSettingsOpen, setIsBackupSettingsOpen] = useState(false);
    const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
    const [isHelpSupportOpen, setIsHelpSupportOpen] = useState(false);
    const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
    const [securityPinStep, setSecurityPinStep] = useState<'menu' | 'set-pin' | 'confirm-pin' | 'change-pin'>('menu');
    const [securityPinInput, setSecurityPinInput] = useState('');
    const [securityPinConfirm, setSecurityPinConfirm] = useState('');
    const [securityPinError, setSecurityPinError] = useState('');
    const { isSecurityEnabled, isBiometricEnabled, setupSecurity, removeSecurity, setupBiometric, removeBiometric, verifySecurity } = useSecurity();
    const [activeThemePanel, setActiveThemePanel] = useState<'app' | 'hero' | 'font'>('app');
    const [backupSettings, setBackupSettings] = useState<BackupSettings>(() => loadBackupSettings());
    const [backupRunning, setBackupRunning] = useState(false);
    const [restoreRunning, setRestoreRunning] = useState(false);
    const [backupError, setBackupError] = useState('');
    const [restoreError, setRestoreError] = useState('');
    const [selectedBackupFileName, setSelectedBackupFileName] = useState('');
    const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
    const [launchingAccountId, setLaunchingAccountId] = useState<string | null>(null);
    const [accountSettingsSaving, setAccountSettingsSaving] = useState(false);
    const [accountSettingsError, setAccountSettingsError] = useState('');
    const [accountSettingsForm, setAccountSettingsForm] = useState({
        username: '',
        email: '',
        password: '',
        phone: ''
    });
    const [themeCropMode, setThemeCropMode] = useState<'fit' | 'crop-portrait'>(() => {
        const saved = localStorage.getItem('app-bg-crop-mode');
        return saved === 'crop-portrait' ? 'crop-portrait' : 'fit';
    });

    // Owner Manager
    const [ownerForm, setOwnerForm] = useState({ name: '' });
    const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
    const [isOwnerManagerOpen, setIsOwnerManagerOpen] = useState(false);
    const [showOwnerForm, setShowOwnerForm] = useState(false);
    const [confirmDeleteOwnerId, setConfirmDeleteOwnerId] = useState<string | null>(null);

    // Reset Manager
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetOptions, setResetOptions] = useState(() => ({ ...DEFAULT_RESET_OPTIONS }));
    const [resetConfirmationText, setResetConfirmationText] = useState('');
    const [resetFeedback, setResetFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

    const fetchMeta = async () => {
        try {
            const data = await fetchMasterMeta();
            setMeta(data);
        } catch (error) {
            console.error('Error fetching menu data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMeta(); }, []);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

    const formatThousands = (raw: string) => {
        if (!raw) return '';
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return '';
        return new Intl.NumberFormat('id-ID').format(numeric);
    };

    const sanitizeAmount = (input: string) => input.replace(/\D/g, '');

    const compressThemeImage = (file: File, cropMode: 'fit' | 'crop-portrait') => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDimension = 800; // Dikurangi dari 1600 agar file hasil Base64 tidak terlalu besar untuk localStorage
                let sourceX = 0;
                let sourceY = 0;
                let sourceWidth = img.width;
                let sourceHeight = img.height;

                if (cropMode === 'crop-portrait') {
                    const targetRatio = 9 / 16;
                    const sourceRatio = img.width / img.height;

                    if (sourceRatio > targetRatio) {
                        sourceWidth = img.height * targetRatio;
                        sourceX = (img.width - sourceWidth) / 2;
                    } else {
                        sourceHeight = img.width / targetRatio;
                        sourceY = (img.height - sourceHeight) / 2;
                    }
                }

                const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
                canvas.width = Math.max(1, Math.round(sourceWidth * scale));
                canvas.height = Math.max(1, Math.round(sourceHeight * scale));

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas tidak tersedia'));
                    return;
                }

                ctx.drawImage(
                    img,
                    sourceX,
                    sourceY,
                    sourceWidth,
                    sourceHeight,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                // Turunkan kualitas JPEG menjadi 60% agar ukuran file string bersahabat dengan limit PWA Safari/Chrome
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = () => reject(new Error('Gagal memuat gambar'));
            img.src = String(reader.result);
        };
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
    });

    const handleThemeImageChange = (file?: File | null) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setThemeImageError('File harus berupa gambar.');
            return;
        }

        void compressThemeImage(file, themeCropMode)
            .then((result) => {
                setBgImage(result);
                setThemeImageError('');
            })
            .catch(() => {
                setThemeImageError('Gagal memproses gambar. Coba pilih file lain.');
            });
    };

    const handleHeroThemeImageChange = (file?: File | null) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setHeroThemeImageError('File harus berupa gambar.');
            return;
        }

        void compressThemeImage(file, themeCropMode)
            .then((result) => {
                setHeroCardImage(result);
                setHeroThemeImageError('');
            })
            .catch(() => {
                setHeroThemeImageError('Gagal memproses gambar kartu utama.');
            });
    };

    const resetThemeCustomization = () => {
        setBgColor('#ffffff');
        setBgImage(null);
        setHeroColor('#16213e');
        setHeroCardImage(null);
        setBgBlur(0);
        setBgOverlay(0.24);
        setHeroImageMode('app-only');
        setThemeCropMode('fit');
        localStorage.setItem('app-bg-crop-mode', 'fit');
        setThemeImageError('');
        setHeroThemeImageError('');
    };

    const getAccountIcon = (type: string) => {
        switch (type) {
            case 'Bank': return <CreditCard size={18} />;
            case 'E-Wallet': return <Smartphone size={18} />;
            case 'RDN': return <TrendingUp size={18} />;
            default: return <Wallet size={18} />;
        }
    };

    const getAccountColor = (type: string) => {
        switch (type) {
            case 'Bank': return 'bg-blue-100 text-blue-600';
            case 'E-Wallet': return 'bg-purple-100 text-purple-600';
            case 'RDN': return 'bg-emerald-100 text-emerald-600';
            case 'Sekuritas': return 'bg-amber-100 text-amber-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    // --- Account handlers ---
    const resetAccountForm = () => {
        setAccountForm({
            name: '',
            type: 'Bank',
            accountNumber: '',
            balance: '',
            ownerId: meta.owners[0]?.id || '',
            appPackageName: '',
            appDeepLink: '',
            appStoreUrl: ''
        });
        setEditingAccountId(null);
    };

    const openAddAccount = () => {
        resetAccountForm();
        setShowAccountForm(true);
    };

    const openEditAccount = (acc: any) => {
        setEditingAccountId(acc.id);
        setAccountForm({
            name: acc.name,
            type: acc.type,
            accountNumber: acc.accountNumber || '',
            balance: String(acc.balance),
            ownerId: acc.ownerId || meta.owners[0]?.id || '',
            appPackageName: acc.appPackageName || '',
            appDeepLink: acc.appDeepLink || '',
            appStoreUrl: acc.appStoreUrl || ''
        });
        setShowAccountForm(true);
    };

    const saveAccount = async () => {
        if (!meta.owners[0]?.id) { alert('Owner belum tersedia.'); return; }
        if (!accountForm.name.trim()) { alert('Nama rekening wajib diisi.'); return; }
        setSaving(true);
        try {
            const payload = {
                name: accountForm.name.trim(),
                type: accountForm.type,
                accountNumber: accountForm.accountNumber.trim() || null,
                appPackageName: accountForm.appPackageName.trim() || null,
                appDeepLink: accountForm.appDeepLink.trim() || null,
                appStoreUrl: accountForm.appStoreUrl.trim() || null,
                balance: Number(accountForm.balance || 0),
                ownerId: accountForm.ownerId || meta.owners[0].id,
            };
            if (editingAccountId) {
                await updateAccount(editingAccountId, payload);
            } else {
                await createAccount(payload);
            }
            setShowAccountForm(false);
            resetAccountForm();
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menyimpan rekening');
        } finally {
            setSaving(false);
        }
    };

    const deleteAccount = async (id: string) => {
        try {
            await removeAccount(id);
            setConfirmDeleteAccountId(null);
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus rekening');
        }
    };

    const applyAccountPreset = (presetKey: string) => {
        const preset = ACCOUNT_APP_PRESETS.find((item) => item.key === presetKey);
        if (!preset) return;

        setAccountForm((prev) => ({
            ...prev,
            appPackageName: preset.packageName,
            appDeepLink: preset.deepLink,
            appStoreUrl: preset.storeUrl
        }));
    };

    const handleLaunchAccount = async (account: Account) => {
        setLaunchingAccountId(account.id);
        try {
            const result = await launchAccountApp(account);
            if (!result.ok && result.message) {
                alert(result.message);
            }
        } finally {
            setLaunchingAccountId(null);
        }
    };

    // --- Activity handlers ---
    const resetActivityForm = () => {
        setActivityForm({ name: '' });
        setEditingActivityId(null);
    };

    const openAddActivity = () => {
        resetActivityForm();
        setShowActivityForm(true);
    };

    const openEditActivity = (activity: Activity) => {
        setEditingActivityId(activity.id);
        setActivityForm({ name: activity.name });
        setShowActivityForm(true);
    };

    const saveActivity = async () => {
        if (!activityForm.name.trim()) { alert('Nama kategori wajib diisi.'); return; }
        setSaving(true);
        try {
            if (editingActivityId) {
                await updateActivity(editingActivityId, activityForm.name.trim());
            } else {
                await createActivity(activityForm.name.trim());
            }
            setShowActivityForm(false);
            resetActivityForm();
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menyimpan kategori');
        } finally {
            setSaving(false);
        }
    };

    const deleteActivity = async (id: string) => {
        try {
            await removeActivity(id);
            setConfirmDeleteActivityId(null);
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus kategori');
        }
    };

    // --- Owner handlers ---
    const resetOwnerForm = () => {
        setOwnerForm({ name: '' });
        setEditingOwnerId(null);
    };

    const openAddOwner = () => {
        resetOwnerForm();
        setShowOwnerForm(true);
    };

    const openEditOwner = (owner: Owner) => {
        setEditingOwnerId(owner.id);
        setOwnerForm({ name: owner.name });
        setShowOwnerForm(true);
    };

    const saveOwner = async () => {
        if (!ownerForm.name.trim()) { alert('Nama pemilik wajib diisi.'); return; }
        setSaving(true);
        try {
            if (editingOwnerId) {
                await updateOwner(editingOwnerId, ownerForm.name.trim());
            } else {
                await createOwner(ownerForm.name.trim());
            }
            setShowOwnerForm(false);
            resetOwnerForm();
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menyimpan pemilik');
        } finally {
            setSaving(false);
        }
    };

    const deleteOwner = async (id: string) => {
        try {
            await removeOwner(id);
            setConfirmDeleteOwnerId(null);
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus pemilik');
        }
    };

    const handleResetOptionsChange = (key: keyof typeof resetOptions, value: boolean) => {
        let newOptions = { ...resetOptions, [key]: value };

        if (value) {
            // Logic saat menceklis: Pastikan data 'diatasnya' yang terkait ikut tercentang
            if (key === 'owners') {
                // Semua Pemilik terpilih -> Berarti Reset Total
                newOptions = { transactions: true, targets: true, categories: true, accounts: true, owners: true };
            } else if (key === 'accounts' || key === 'categories') {
                // Rekening & Kategori butuh Transaksi dihapus
                newOptions.transactions = true;
            }
        } else {
            // Logic saat un-ceklis: Jika data 'diatasnya' dibatalkan, data 'dibawahnya' tidak boleh tercentang
            if (key === 'transactions') {
                newOptions.accounts = false;
                newOptions.categories = false;
                newOptions.owners = false;
            } else if (key === 'accounts' || key === 'categories' || key === 'targets') {
                // Jika salah satu komponen dibatalkan, maka "Reset Semua Pemilik" juga batal
                newOptions.owners = false;
            }
        }

        setResetOptions(newOptions);
    };

    const submitGranularReset = async () => {
        if (!Object.values(resetOptions).some(v => v)) {
            setResetFeedback({ type: 'error', message: 'Pilih minimal 1 data yang ingin dihapus.' });
            return;
        }
        if (resetConfirmationText.trim().toUpperCase() !== 'RESET') {
            setResetFeedback({ type: 'error', message: "Ketik 'RESET' pada kolom konfirmasi untuk mengeksekusi penghapusan." });
            return;
        }

        setResetDataLoading(true);
        setResetFeedback(null);
        try {
            if (supabase) {
                // Delete in FK-safe order: children first, parents last
                if (resetOptions.transactions) {
                    const { error: e1 } = await supabase.from('Transaction').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e1) throw new Error(e1.message);
                    const { error: e2 } = await supabase.from('NotificationInbox').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e2 && !e2.message.includes('does not exist')) throw new Error(e2.message);
                }
                if (resetOptions.targets) {
                    const { error: e3 } = await supabase.from('Target').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e3 && !e3.message.includes('does not exist')) throw new Error(e3.message);
                    const { error: e4 } = await supabase.from('Budget').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e4 && !e4.message.includes('does not exist')) throw new Error(e4.message);
                }
                if (resetOptions.accounts) {
                    const { error: e5 } = await supabase.from('Account').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e5) throw new Error(e5.message);
                }
                if (resetOptions.categories) {
                    const { error: e6 } = await supabase.from('Activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e6) throw new Error(e6.message);
                }
                if (resetOptions.owners) {
                    const { error: e7 } = await supabase.from('Owner').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (e7) throw new Error(e7.message);
                }
            } else {
                // Fallback to backend API
                await api.post('/master/reset-data', {
                    resetTransactions: resetOptions.transactions,
                    resetNotifications: resetOptions.transactions,
                    resetTargets: resetOptions.targets,
                    resetAccounts: resetOptions.accounts,
                    resetActivities: resetOptions.categories,
                    resetOwners: resetOptions.owners
                });
            }
            setResetFeedback({ type: 'success', message: 'Data berhasil direset. Halaman akan dimuat ulang...' });
            window.setTimeout(() => {
                window.location.reload();
            }, 900);
        } catch (error: any) {
            setResetFeedback({ type: 'error', message: error?.message || error?.response?.data?.error || 'Gagal mereset data.' });
        } finally {
            setResetDataLoading(false);
        }
    };

    const profileDisplayName = (
        user?.user_metadata?.full_name
        || user?.user_metadata?.name
        || user?.email?.split('@')[0]
        || meta.owners[0]?.name
        || 'User'
    ) as string;

    const mainOwner = { name: profileDisplayName };
    const startOwnerSetup = () => {
        setIsHelpSupportOpen(false);
        setShowOwnerForm(false);
        setIsOwnerManagerOpen(true);
    };
    const startCategorySetup = () => {
        setIsHelpSupportOpen(false);
        setShowActivityForm(false);
        setIsActivityManagerOpen(true);
    };
    const startAccountSetup = () => {
        setIsHelpSupportOpen(false);
        setShowAccountForm(false);
        setIsAccountManagerOpen(true);
    };

    useEffect(() => {
        if (!isAccountSettingsOpen) return;

        setAccountSettingsForm({
            username: String(
                user?.user_metadata?.full_name
                || user?.user_metadata?.name
                || user?.email?.split('@')[0]
                || meta.owners[0]?.name
                || ''
            ),
            email: user?.email || '',
            password: '',
            phone: String(user?.user_metadata?.phone || '')
        });
        setAccountSettingsError('');
    }, [isAccountSettingsOpen, meta.owners, user]);

    const saveAccountSettings = async () => {
        if (!supabase || !user) {
            setAccountSettingsError('Konfigurasi akun tidak tersedia.');
            return;
        }

        if (!accountSettingsForm.username.trim()) {
            setAccountSettingsError('Username wajib diisi.');
            return;
        }

        if (!accountSettingsForm.email.trim()) {
            setAccountSettingsError('Email wajib diisi.');
            return;
        }

        if (accountSettingsForm.password && accountSettingsForm.password.length < 6) {
            setAccountSettingsError('Password baru minimal 6 karakter.');
            return;
        }

        setAccountSettingsSaving(true);
        setAccountSettingsError('');
        try {
            const payload: {
                email?: string;
                password?: string;
                data: Record<string, unknown>;
            } = {
                data: {
                    full_name: accountSettingsForm.username.trim(),
                    name: accountSettingsForm.username.trim(),
                    phone: accountSettingsForm.phone.trim()
                }
            };

            if (accountSettingsForm.email.trim() !== user.email) {
                payload.email = accountSettingsForm.email.trim();
            }

            if (accountSettingsForm.password) {
                payload.password = accountSettingsForm.password;
            }

            const { error } = await supabase.auth.updateUser(payload);
            if (error) throw error;

            alert('Pengaturan akun berhasil diperbarui.');
            setIsAccountSettingsOpen(false);
        } catch (error: any) {
            setAccountSettingsError(error?.message || 'Gagal memperbarui pengaturan akun.');
        } finally {
            setAccountSettingsSaving(false);
        }
    };

    const filteredAccounts = meta.accounts.filter((acc) =>
        acc.name.toLowerCase().includes(accountQuery.toLowerCase()) ||
        acc.type.toLowerCase().includes(accountQuery.toLowerCase())
    );
    const filteredActivities = meta.activities.filter((a) =>
        a.name.toLowerCase().includes(activityQuery.toLowerCase())
    );

    const totalAccountPages = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
    const totalActivityPages = Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE));
    const paginatedAccounts = filteredAccounts.slice((accountPage - 1) * PAGE_SIZE, accountPage * PAGE_SIZE);
    const paginatedActivities = filteredActivities.slice((activityPage - 1) * PAGE_SIZE, activityPage * PAGE_SIZE);

    useEffect(() => { setAccountPage(1); }, [accountQuery, meta.accounts.length]);
    useEffect(() => { setActivityPage(1); }, [activityQuery, meta.activities.length]);
    useEffect(() => { if (accountPage > totalAccountPages) setAccountPage(totalAccountPages); }, [accountPage, totalAccountPages]);
    useEffect(() => { if (activityPage > totalActivityPages) setActivityPage(totalActivityPages); }, [activityPage, totalActivityPages]);
    useEffect(() => { saveBackupSettings(backupSettings); }, [backupSettings]);
    useEffect(() => {
        const shouldOpenAccounts = new URLSearchParams(location.search).get('accounts') === '1';
        if (!shouldOpenAccounts) return;

        setShowAccountForm(false);
        setIsAccountManagerOpen(true);
        navigate('/menu', { replace: true });
    }, [location.search, navigate]);

    const formatBackupDate = (value: string | null) => {
        if (!value) return 'Belum pernah';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'Belum pernah';
        return new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(parsed);
    };

    const updateBackupSettings = (patch: Partial<BackupSettings>) => {
        setBackupSettings((prev) => ({ ...prev, ...patch }));
    };

    const handleBackupNow = async (mode: 'manual' | 'auto' = 'manual') => {
        setBackupRunning(true);
        setBackupError('');

        try {
            const blob = await exportBackupJson(backupSettings.includeNotifications);
            const completedAt = new Date().toISOString();
            downloadBackupBlob(blob, buildBackupFilename(new Date(completedAt)));
            setBackupSettings((prev) => ({ ...prev, lastBackupAt: completedAt }));

            if (mode === 'manual') {
                alert('Backup berhasil dibuat. File disimpan ke folder unduhan perangkat/browser.');
            }
        } catch (error: any) {
            const message = error?.response?.data?.error || 'Gagal membuat backup data.';
            setBackupError(message);
            if (mode === 'manual') {
                alert(message);
            }
        } finally {
            setBackupRunning(false);
        }
    };

    const handleRestoreFileChange = async (file?: File | null) => {
        if (!file) return;

        setSelectedBackupFileName(file.name);
        setRestoreError('');
        setRestorePreview(null);

        if (!file.name.toLowerCase().endsWith('.json')) {
            setRestoreError('File restore harus berupa JSON.');
            return;
        }

        try {
            const rawText = await file.text();
            const payload = JSON.parse(rawText);
            const data = payload?.data;
            if (!data || typeof data !== 'object') {
                throw new Error('Format file backup tidak valid.');
            }

            setRestorePreview({
                fileName: file.name,
                exportedAt: payload?.meta?.exportedAt ?? null,
                includeNotifications: payload?.meta?.includeNotifications,
                counts: {
                    owners: Array.isArray(data.owners) ? data.owners.length : 0,
                    accounts: Array.isArray(data.accounts) ? data.accounts.length : 0,
                    activities: Array.isArray(data.activities) ? data.activities.length : 0,
                    budgets: Array.isArray(data.budgets) ? data.budgets.length : 0,
                    targets: Array.isArray(data.targets) ? data.targets.length : 0,
                    notifications: Array.isArray(data.notifications) ? data.notifications.length : 0,
                    transactions: Array.isArray(data.transactions) ? data.transactions.length : 0
                },
                payload
            });
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || 'Gagal membaca file backup.';
            setRestoreError(message);
        }
    };

    const submitRestoreBackup = async () => {
        if (!restorePreview) {
            alert('Pilih file backup lebih dulu.');
            return;
        }

        const confirmRestore = window.confirm(
            'Restore akan mengganti seluruh data aktif dengan isi file backup. Lanjutkan?'
        );
        if (!confirmRestore) return;

        const check = window.prompt("Ketik 'RESTORE' untuk mengeksekusi pemulihan data:");
        if (check !== 'RESTORE') {
            alert('Restore dibatalkan.');
            return;
        }

        setRestoreRunning(true);
        setRestoreError('');
        try {
            await restoreBackupJson(restorePreview.payload);
            alert('Restore backup berhasil. Halaman akan dimuat ulang.');
            window.location.reload();
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || 'Gagal memulihkan backup.';
            setRestoreError(message);
            alert(message);
        } finally {
            setRestoreRunning(false);
        }
    };

    useEffect(() => {
        if (!shouldRunAutoBackup(backupSettings) || backupRunning) return;
        void handleBackupNow('auto');
    }, [backupRunning, backupSettings, handleBackupNow]);

    if (loading) return <Spinner message="Memuat Profil..." />;

    return (
        <div className="px-3 py-4 sm:p-4 md:p-8 space-y-5 sm:space-y-6 pb-28 sm:pb-32 mx-auto w-full max-w-2xl relative">
            {/* Profile Card */}
            <div className="app-hero-card rounded-3xl p-4 sm:p-6 min-h-[132px] sm:min-h-[148px]">
                <div className="flex items-start gap-3 sm:gap-5">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl font-bold shadow-lg shrink-0" style={{ background: 'linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-hero-glow) 100%)', boxShadow: '0 16px 28px -18px color-mix(in srgb, var(--theme-accent) 70%, transparent)' }}>
                        {mainOwner.name.substring(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base sm:text-lg font-bold text-white truncate">{mainOwner.name}</h2>
                        <p className="text-white/55 text-xs font-semibold truncate">{user?.email || 'Premium Member'}</p>
                        <div className="mt-2 text-[10px] px-3 py-1 rounded-full w-fit font-bold uppercase tracking-tighter border text-white" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)', borderColor: 'color-mix(in srgb, var(--theme-accent) 30%, white 10%)' }}>
                            Keamanan Aktif
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsAccountSettingsOpen(true)}
                        className="p-2.5 rounded-xl text-white/60 hover:text-white transition-colors shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb, white 8%, transparent)' }}
                    >
                        <Settings size={18} />
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Anggota</p>
                        <p className="mt-1 text-sm font-bold text-white">{meta.owners.length}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Rekening</p>
                        <p className="mt-1 text-sm font-bold text-white">{meta.accounts.length}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Kategori</p>
                        <p className="mt-1 text-sm font-bold text-white">{meta.activities.length}</p>
                    </div>
                </div>
            </div>

            {/* Settings List */}
            <section className="space-y-3">
                <div className="app-section-header rounded-2xl px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Pengaturan & Setup</p>
                </div>
                <div className="app-surface-card rounded-[28px] overflow-hidden">
                    {/* Setup Rekening */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => { setShowAccountForm(false); setIsAccountManagerOpen(true); }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                <Wallet size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Setup Rekening</span>
                                <span className="block text-[11px] text-slate-500 truncate">Bank, e-wallet, RDN, dan sekuritas</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-blue-100 text-blue-600 font-bold px-2 py-0.5 rounded-full">{meta.accounts.length}</span>
                            <ChevronRight size={16} className="text-slate-400" />
                        </div>
                    </button>

                    {/* Setup Kategori */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => { setShowActivityForm(false); setIsActivityManagerOpen(true); }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                <Tag size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Setup Kategori</span>
                                <span className="block text-[11px] text-slate-500 truncate">Kelompok pemasukan dan pengeluaran</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-emerald-100 text-emerald-600 font-bold px-2 py-0.5 rounded-full">{meta.activities.length}</span>
                            <ChevronRight size={16} className="text-slate-400" />
                        </div>
                    </button>

                    {/* Setup Pemilik */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => { setShowOwnerForm(false); setIsOwnerManagerOpen(true); }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                                <User size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Setup Anggota / Pemilik</span>
                                <span className="block text-[11px] text-slate-500 truncate">Pisahkan dana dan transaksi per orang</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-violet-100 text-violet-600 font-bold px-2 py-0.5 rounded-full">{meta.owners.length}</span>
                            <ChevronRight size={16} className="text-slate-400" />
                        </div>
                    </button>

                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => {
                            setActiveThemePanel('app');
                            setIsThemeCustomizerOpen(true);
                        }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Palette size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Tema & Tampilan</span>
                                <span className="block text-[11px] text-slate-500 truncate">Atur visual aplikasi dan ukuran tampilan</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                    </button>

                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => setIsBackupSettingsOpen(true)}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                                <Download size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Backup Data</span>
                                <span className="block text-[11px] text-slate-500 truncate">Terakhir: {formatBackupDate(backupSettings.lastBackupAt)}</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                    </button>

                    {/* Bantuan */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => setIsHelpSupportOpen(true)}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                                <User size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Bantuan & Dukungan</span>
                                <span className="block text-[11px] text-slate-500 truncate">Lihat alur setup awal dan panduan penggunaan</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                    </button>

                    {/* Keamanan Transaksi */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left"
                        onClick={() => { setSecurityPinStep('menu'); setSecurityPinInput(''); setSecurityPinConfirm(''); setSecurityPinError(''); setIsSecurityModalOpen(true); }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                <Lock size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-800 truncate">Keamanan Transaksi</span>
                                <span className="block text-[11px] text-slate-500 truncate">
                                    {isSecurityEnabled ? `PIN Aktif${isBiometricEnabled ? ' • Biometrik On' : ''}` : 'Belum diatur'}
                                </span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                    </button>

                    {/* Reset Data */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-rose-50/80 transition-colors text-left"
                        onClick={() => {
                            setResetFeedback(null);
                            setResetConfirmationText('');
                            setResetOptions({ ...DEFAULT_RESET_OPTIONS });
                            setIsResetModalOpen(true);
                        }}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                                <Trash2 size={16} />
                            </div>
                            <div className="min-w-0">
                                <span className="block text-sm font-semibold text-rose-700 truncate">Reset & Pemulihan Data</span>
                                <span className="block text-[11px] text-rose-500 truncate">Hapus data atau pulihkan dari backup</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-rose-400" />
                    </button>
                </div>
            </section>

            <button
                onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
                className="w-full h-14 app-surface-card rounded-[24px] flex items-center justify-center gap-3 text-rose-600 font-bold uppercase tracking-widest text-xs hover:bg-white/70 transition-all mt-4"
            >
                <LogOut size={16} /> Keluar Aplikasi
            </button>

            <div className="app-surface-muted rounded-[22px] px-4 py-3 text-center pb-3">
                <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest">NOVA v1.0.0</p>
                <p className="text-slate-500 text-[10px] italic mt-1">Design by bashorfauzan</p>
            </div>

            {isThemeCustomizerOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => setIsThemeCustomizerOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">Tema & Tampilan</h3>
                                <p className="text-sm text-slate-500 mt-1">Atur background aplikasi dan kartu utama. Semua tersimpan lokal di smartphone ini.</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={resetThemeCustomization}
                                    className="h-9 px-3 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                                >
                                    Reset
                                </button>
                                <button onClick={() => setIsThemeCustomizerOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain">
                            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div
                                        className="w-full sm:w-24 aspect-[16/9] sm:h-14 sm:aspect-auto rounded-2xl border border-white/70 shadow-sm bg-center bg-cover"
                                        style={{
                                            backgroundColor: activeThemePanel === 'app' ? bgColor : activeThemePanel === 'hero' ? heroColor : '#f1f5f9',
                                            backgroundImage: activeThemePanel === 'app'
                                                ? (bgImage ? `url(${bgImage})` : 'none')
                                                : activeThemePanel === 'hero'
                                                    ? (heroCardImage ? `url(${heroCardImage})` : 'none')
                                                    : 'none'
                                        }}
                                    >
                                        {activeThemePanel === 'font' && (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className="text-slate-400 font-bold" style={{ fontSize: `${appScale * 14}px` }}>Aa</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveThemePanel('app')}
                                    className={`h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeThemePanel === 'app' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                                >
                                    App
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveThemePanel('hero')}
                                    className={`h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeThemePanel === 'hero' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Kartu
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveThemePanel('font')}
                                    className={`h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeThemePanel === 'font' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Ukuran
                                </button>
                            </div>

                            {activeThemePanel === 'font' ? (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Skala Tampilan</p>
                                            <p className="text-xs text-slate-500 mt-1">Mengatur ukuran font dan antarmuka agar pas di layar smartphone Anda.</p>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {[
                                                { label: 'Kecil', value: 0.875, desc: 'Lebih padat' },
                                                { label: 'Normal', value: 1.0, desc: 'Standar' },
                                                { label: 'Besar', value: 1.125, desc: 'Mudah dibaca' },
                                                { label: 'Ekstra', value: 1.25, desc: 'Paling jelas' }
                                            ].map((scale) => (
                                                <button
                                                    key={scale.label}
                                                    type="button"
                                                    onClick={() => setAppScale(scale.value)}
                                                    className={`p-3 rounded-2xl border transition-all text-left flex flex-col justify-center ${appScale === scale.value ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    <p className={`font-bold ${appScale === scale.value ? 'text-indigo-700' : 'text-slate-700'}`}>{scale.label}</p>
                                                    <p className={`text-[10px] mt-1 ${appScale === scale.value ? 'text-indigo-500' : 'text-slate-500'}`}>{scale.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                                        <p className="text-xs text-amber-800 leading-relaxed">
                                            <span className="font-bold">Tips Responsif:</span> Jika ada bagian UI yang terpotong di layar HP Anda, cobalah turunkan skala menjadi <span className="font-bold">Kecil</span>.
                                        </p>
                                    </div>
                                </div>
                            ) : activeThemePanel === 'app' ? (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Warna Background</p>
                                            <p className="text-xs text-slate-500 mt-1">Pilih warna dasar untuk halaman aplikasi.</p>
                                        </div>
                                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                            {THEME_PRESETS.map((preset) => (
                                                <button
                                                    key={preset.name}
                                                    onClick={() => setBgColor(preset.color)}
                                                    className={`w-10 h-10 rounded-full border-2 transition-transform active:scale-95 justify-self-start ${bgColor === preset.color ? 'border-blue-500 scale-110 shadow-md' : 'border-slate-200 shadow-sm'}`}
                                                    style={{ backgroundColor: preset.color }}
                                                    aria-label={preset.name}
                                                    title={preset.name}
                                                />
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                                            <input type="color" id="custom-color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                            <div>
                                                <label htmlFor="custom-color" className="text-xs font-bold text-slate-700 block">Warna kustom</label>
                                                <p className="text-[11px] text-slate-400 uppercase tracking-widest">{bgColor}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            {bgImage ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setBgImage(null)}
                                                    className="h-9 px-3 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                                                >
                                                    Hapus
                                                </button>
                                            ) : null}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setThemeCropMode('fit'); localStorage.setItem('app-bg-crop-mode', 'fit'); }}
                                                className={`h-10 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${themeCropMode === 'fit' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                Mode Asli
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setThemeCropMode('crop-portrait'); localStorage.setItem('app-bg-crop-mode', 'crop-portrait'); }}
                                                className={`h-10 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${themeCropMode === 'crop-portrait' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                Crop Portrait
                                            </button>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <label className="h-11 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer text-center sm:min-w-[220px]">
                                                Pilih dari Galeri
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => handleThemeImageChange(e.target.files?.[0])}
                                                />
                                            </label>
                                            <div className="text-xs text-slate-500">{bgImage ? 'Gambar aktif dan siap dipakai' : 'Belum ada gambar dipilih'}</div>
                                        </div>

                                        {bgImage ? (
                                            <div className="aspect-[9/16] sm:aspect-[16/9] rounded-2xl border border-slate-200 bg-center bg-cover" style={{ backgroundImage: `url(${bgImage})` }} />
                                        ) : null}
                                        {themeImageError ? <p className="text-[11px] font-medium text-rose-500">{themeImageError}</p> : null}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <label className="block">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Blur Background</span>
                                                <input type="range" min="0" max="18" step="1" value={bgBlur} onChange={(e) => setBgBlur(Number(e.target.value))} className="mt-2 w-full" />
                                                <span className="text-[11px] text-slate-500">{bgBlur}px</span>
                                            </label>
                                            <label className="block">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overlay Teks</span>
                                                <input type="range" min="0.05" max="0.55" step="0.01" value={bgOverlay} onChange={(e) => setBgOverlay(Number(e.target.value))} className="mt-2 w-full" />
                                                <span className="text-[11px] text-slate-500">{Math.round(bgOverlay * 100)}%</span>
                                            </label>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pengaruh Gambar</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setHeroImageMode('app-only')}
                                                    className={`h-10 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${heroImageMode === 'app-only' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    Hanya Background App
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setHeroImageMode('app-and-hero')}
                                                    className={`h-10 rounded-xl border text-[11px] font-bold uppercase tracking-wider ${heroImageMode === 'app-and-hero' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    Ikut Hero Card
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Warna Kartu Utama</p>
                                            <p className="text-xs text-slate-500 mt-1">Dipakai di Home, Investasi, Target, dan Menu.</p>
                                        </div>
                                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                            {THEME_PRESETS.map((preset) => (
                                                <button
                                                    key={`hero-${preset.name}`}
                                                    onClick={() => setHeroColor(preset.color)}
                                                    className={`w-10 h-10 rounded-full border-2 transition-transform active:scale-95 justify-self-start ${heroColor === preset.color ? 'border-blue-500 scale-110 shadow-md' : 'border-slate-200 shadow-sm'}`}
                                                    style={{ backgroundColor: preset.color }}
                                                    aria-label={`${preset.name} hero`}
                                                    title={`${preset.name} hero`}
                                                />
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                                            <input type="color" id="hero-color" value={heroColor} onChange={(e) => setHeroColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                            <div>
                                                <label htmlFor="hero-color" className="text-xs font-bold text-slate-700 block">Warna kustom kartu</label>
                                                <p className="text-[11px] text-slate-400 uppercase tracking-widest">{heroColor}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">Gambar Kartu Utama</p>
                                                <p className="text-xs text-slate-500 mt-1">Pilih gambar khusus untuk hero card utama.</p>
                                            </div>

                                            {heroCardImage ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setHeroCardImage(null)}
                                                    className="h-9 px-3 rounded-xl border border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                                                >
                                                    Hapus
                                                </button>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <label className="h-11 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer text-center sm:min-w-[220px]">
                                                Pilih Gambar Kartu
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => handleHeroThemeImageChange(e.target.files?.[0])}
                                                />
                                            </label>
                                            <div className="text-xs text-slate-500">{heroCardImage ? 'Gambar kartu aktif' : 'Belum ada gambar kartu'}</div>
                                        </div>

                                        {heroCardImage ? (
                                            <div className="aspect-[9/16] sm:aspect-[16/9] rounded-2xl border border-slate-200 bg-center bg-cover" style={{ backgroundImage: `url(${heroCardImage})` }} />
                                        ) : null}
                                        {heroThemeImageError ? <p className="text-[11px] font-medium text-rose-500">{heroThemeImageError}</p> : null}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isAccountSettingsOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => setIsAccountSettingsOpen(false)}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">Pengaturan Akun</h3>
                                <p className="text-sm text-slate-500 mt-1">Ubah username, email, password, dan nomor HP akun.</p>
                            </div>
                            <button onClick={() => setIsAccountSettingsOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain">
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Username</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={accountSettingsForm.username}
                                        onChange={(e) => setAccountSettingsForm((prev) => ({ ...prev, username: e.target.value }))}
                                        placeholder="Nama pengguna"
                                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Email</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="email"
                                        value={accountSettingsForm.email}
                                        onChange={(e) => setAccountSettingsForm((prev) => ({ ...prev, email: e.target.value }))}
                                        placeholder="email@contoh.com"
                                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Password Baru</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="password"
                                        value={accountSettingsForm.password}
                                        onChange={(e) => setAccountSettingsForm((prev) => ({ ...prev, password: e.target.value }))}
                                        placeholder="Kosongkan jika tidak ingin ganti"
                                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">No. HP</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={accountSettingsForm.phone}
                                        onChange={(e) => setAccountSettingsForm((prev) => ({ ...prev, phone: e.target.value }))}
                                        placeholder="08xxxxxxxxxx"
                                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>

                            {accountSettingsError ? (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                                    {accountSettingsError}
                                </div>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => void saveAccountSettings()}
                                disabled={accountSettingsSaving}
                                className="w-full h-11 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-blue-700 transition-colors"
                            >
                                <Save size={14} /> {accountSettingsSaving ? 'Menyimpan...' : 'Simpan Pengaturan Akun'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isHelpSupportOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => setIsHelpSupportOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">Bantuan & Dukungan</h3>
                                <p className="text-sm text-slate-500 mt-1">Panduan setup awal agar pengguna tahu urutan isi data sebelum mulai mencatat transaksi.</p>
                            </div>
                            <button onClick={() => setIsHelpSupportOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain">
                            <div className="rounded-[28px] border border-indigo-200 bg-gradient-to-br from-indigo-950 via-indigo-900 to-blue-900 p-5 text-white">
                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-200">Urutan Yang Disarankan</p>
                                <h4 className="text-xl font-bold mt-2">1. Setup Anggota  2. Setup Kategori  3. Setup Rekening</h4>
                                <p className="text-sm text-indigo-100/90 mt-2 leading-relaxed">
                                    Tiga langkah ini adalah pondasi aplikasi. Jika urutannya benar, transaksi otomatis maupun manual akan lebih cepat diisi dan laporan akan langsung rapi.
                                </p>
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                                        <div className="w-10 h-10 rounded-2xl bg-violet-400/20 flex items-center justify-center">
                                            <User size={18} />
                                        </div>
                                        <p className="text-sm font-bold mt-3">Setup Anggota</p>
                                        <p className="text-xs text-indigo-100/85 mt-1">Tentukan siapa pemilik uang atau siapa yang melakukan transaksi.</p>
                                    </div>
                                    <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                                        <div className="w-10 h-10 rounded-2xl bg-emerald-400/20 flex items-center justify-center">
                                            <Tag size={18} />
                                        </div>
                                        <p className="text-sm font-bold mt-3">Setup Kategori</p>
                                        <p className="text-xs text-indigo-100/85 mt-1">Buat kelompok pemasukan dan pengeluaran yang sering dipakai.</p>
                                    </div>
                                    <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                                        <div className="w-10 h-10 rounded-2xl bg-amber-400/20 flex items-center justify-center">
                                            <Wallet size={18} />
                                        </div>
                                        <p className="text-sm font-bold mt-3">Setup Rekening</p>
                                        <p className="text-xs text-indigo-100/85 mt-1">Tambahkan bank, e-wallet, RDN, atau akun sekuritas yang dipakai.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Gambar Alur Setup</p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-center">
                                    <div className="rounded-2xl bg-white border border-violet-200 p-3">
                                        <p className="text-xs font-bold text-violet-700">Anggota</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">Bashor</span>
                                            <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">Istri</span>
                                            <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">Usaha</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex justify-center text-slate-300 text-xl font-bold">→</div>
                                    <div className="rounded-2xl bg-white border border-emerald-200 p-3">
                                        <p className="text-xs font-bold text-emerald-700">Kategori</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Gaji</span>
                                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Makan</span>
                                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Belanja</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex justify-center text-slate-300 text-xl font-bold">→</div>
                                    <div className="rounded-2xl bg-white border border-amber-200 p-3">
                                        <p className="text-xs font-bold text-amber-700">Rekening</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">BNI</span>
                                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">DANA</span>
                                            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">RDN</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                                    Setelah tiga kotak di atas terisi, barulah transaksi mudah dipilih: <span className="font-semibold text-slate-700">siapa pemiliknya</span>, <span className="font-semibold text-slate-700">masuk kategori apa</span>, dan <span className="font-semibold text-slate-700">rekening mana yang bergerak</span>.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="rounded-3xl border border-violet-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-500">Langkah 1</p>
                                            <h4 className="text-base font-bold text-slate-900 mt-1">Setup Anggota / Pemilik</h4>
                                        </div>
                                        <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                            <User size={18} />
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                                        Masukkan nama user atau pihak yang akan memakai aplikasi. Contohnya: <span className="font-semibold text-slate-800">Bashor</span>, <span className="font-semibold text-slate-800">Istri</span>, atau <span className="font-semibold text-slate-800">Tim Usaha</span>.
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="rounded-2xl bg-violet-50 p-3">
                                            <p className="font-bold text-violet-700">Apa yang diisi</p>
                                            <p className="text-violet-700/80 mt-1">Nama anggota atau pemilik dana/transaksi.</p>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-3">
                                            <p className="font-bold text-slate-700">Hasilnya</p>
                                            <p className="text-slate-600 mt-1">Laporan dan target bisa dipisahkan per orang atau per unit.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={startOwnerSetup}
                                        className="mt-4 h-11 px-4 rounded-2xl bg-violet-600 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors"
                                    >
                                        Buka Setup Anggota <ChevronRight size={14} />
                                    </button>
                                </div>

                                <div className="rounded-3xl border border-emerald-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-500">Langkah 2</p>
                                            <h4 className="text-base font-bold text-slate-900 mt-1">Setup Kategori</h4>
                                        </div>
                                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                            <Tag size={18} />
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                                        Buat kategori sesuai kebiasaan Anda. Pakai nama yang sederhana dan langsung dipahami, misalnya <span className="font-semibold text-slate-800">Gaji</span>, <span className="font-semibold text-slate-800">Makan</span>, <span className="font-semibold text-slate-800">Belanja</span>, <span className="font-semibold text-slate-800">Transport</span>, atau <span className="font-semibold text-slate-800">Investasi</span>.
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="rounded-2xl bg-emerald-50 p-3">
                                            <p className="font-bold text-emerald-700">Apa yang diisi</p>
                                            <p className="text-emerald-700/80 mt-1">Nama kategori transaksi yang paling sering digunakan.</p>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-3">
                                            <p className="font-bold text-slate-700">Hasilnya</p>
                                            <p className="text-slate-600 mt-1">Laporan jadi rapi dan target pengeluaran bisa dipantau per kategori.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={startCategorySetup}
                                        className="mt-4 h-11 px-4 rounded-2xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
                                    >
                                        Buka Setup Kategori <ChevronRight size={14} />
                                    </button>
                                </div>

                                <div className="rounded-3xl border border-amber-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-500">Langkah 3</p>
                                            <h4 className="text-base font-bold text-slate-900 mt-1">Setup Rekening</h4>
                                        </div>
                                        <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                            <Wallet size={18} />
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                                        Tambahkan rekening yang benar-benar dipakai sehari-hari. Isi nama rekening, tipe, nomor rekening bila perlu, saldo awal, dan pilih pemiliknya. Jika tersedia, isi juga data pembuka aplikasi bank/e-wallet agar tombol <span className="font-semibold text-slate-800">Buka</span> bisa dipakai.
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="rounded-2xl bg-amber-50 p-3">
                                            <p className="font-bold text-amber-700">Apa yang diisi</p>
                                            <p className="text-amber-700/80 mt-1">Nama rekening, tipe, saldo awal, pemilik, dan opsional deep link aplikasi.</p>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-3">
                                            <p className="font-bold text-slate-700">Hasilnya</p>
                                            <p className="text-slate-600 mt-1">Setiap transaksi langsung masuk ke saldo rekening yang benar.</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={startAccountSetup}
                                        className="mt-4 h-11 px-4 rounded-2xl bg-amber-500 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
                                    >
                                        Buka Setup Rekening <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Contoh Setup Cepat</p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="rounded-2xl bg-white border border-slate-200 p-3">
                                        <p className="text-xs font-bold text-slate-800">Anggota</p>
                                        <p className="text-xs text-slate-500 mt-1">Bashor, Rumah Tangga</p>
                                    </div>
                                    <div className="rounded-2xl bg-white border border-slate-200 p-3">
                                        <p className="text-xs font-bold text-slate-800">Kategori</p>
                                        <p className="text-xs text-slate-500 mt-1">Gaji, Makan, Belanja, Investasi</p>
                                    </div>
                                    <div className="rounded-2xl bg-white border border-slate-200 p-3">
                                        <p className="text-xs font-bold text-slate-800">Rekening</p>
                                        <p className="text-xs text-slate-500 mt-1">BNI Utama, DANA, RDN Stockbit</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                                    Setelah setup selesai, pengguna bisa mulai input transaksi, menerima notifikasi otomatis, membuat target, dan membaca laporan tanpa harus menata ulang data dasar lagi.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isBackupSettingsOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => setIsBackupSettingsOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900">Backup Data</h3>
                                <p className="text-sm text-slate-500 mt-1">Simpan snapshot data ke file JSON agar ada cadangan di perangkat ini.</p>
                            </div>
                            <button onClick={() => setIsBackupSettingsOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain">
                            <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4">
                                <p className="text-sm font-bold text-amber-900">Lokasi penyimpanan</p>
                                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                    Backup akan diunduh ke folder default perangkat/browser, biasanya <span className="font-bold">Downloads</span>. Untuk simpan langsung ke direktori instalasi app Android, aplikasi perlu dibungkus menjadi APK native.
                                </p>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Backup otomatis</p>
                                        <p className="text-xs text-slate-500 mt-1">Saat waktunya jatuh tempo dan aplikasi dibuka, file backup baru akan dibuat otomatis.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateBackupSettings({ autoBackup: !backupSettings.autoBackup })}
                                        className={`relative h-7 w-12 rounded-full transition-colors ${backupSettings.autoBackup ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        aria-label="Toggle auto backup"
                                    >
                                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${backupSettings.autoBackup ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </div>

                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Frekuensi</label>
                                    <select
                                        value={backupSettings.frequency}
                                        onChange={(e) => updateBackupSettings({ frequency: e.target.value as BackupSettings['frequency'] })}
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white"
                                    >
                                        <option value="manual">Manual saja</option>
                                        <option value="daily">Harian</option>
                                        <option value="weekly">Mingguan</option>
                                    </select>
                                </div>

                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 accent-amber-600"
                                        checked={backupSettings.includeNotifications}
                                        onChange={(e) => updateBackupSettings({ includeNotifications: e.target.checked })}
                                    />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Sertakan riwayat notifikasi</p>
                                        <p className="text-[11px] text-slate-500 mt-1">Aktifkan jika Anda juga ingin membackup inbox notifikasi yang masuk ke sistem.</p>
                                    </div>
                                </label>
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-bold text-slate-800">Status backup</p>
                                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{backupRunning ? 'Proses' : 'Siap'}</span>
                                </div>
                                <p className="text-xs text-slate-600">Backup terakhir: {formatBackupDate(backupSettings.lastBackupAt)}</p>
                                <p className="text-xs text-slate-500">Format file: JSON snapshot. Cocok untuk arsip data penuh, bukan sekadar laporan.</p>
                                {backupError ? <p className="text-xs font-medium text-rose-600">{backupError}</p> : null}
                            </div>

                            <button
                                type="button"
                                onClick={() => void handleBackupNow('manual')}
                                disabled={backupRunning}
                                className="w-full h-11 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-amber-700 transition-colors"
                            >
                                <Download size={14} /> {backupRunning ? 'Membuat Backup...' : 'Backup Sekarang'}
                            </button>

                            <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
                                <div>
                                    <p className="text-sm font-bold text-slate-800">Restore Dari Backup</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Pilih file backup dulu untuk melihat ringkasannya. Restore akan mengganti data yang sedang aktif.
                                    </p>
                                </div>

                                <label className="h-11 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer text-center hover:bg-slate-50 transition-colors">
                                    {restoreRunning ? 'Memproses Restore...' : 'Pilih File Backup JSON'}
                                    <input
                                        type="file"
                                        accept="application/json,.json"
                                        className="hidden"
                                        disabled={restoreRunning}
                                        onChange={(e) => {
                                            void handleRestoreFileChange(e.target.files?.[0]);
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                </label>

                                <p className="text-xs text-slate-500">
                                    {selectedBackupFileName ? `File terpilih: ${selectedBackupFileName}` : 'Belum ada file dipilih'}
                                </p>
                                {restoreError ? <p className="text-xs font-medium text-rose-600">{restoreError}</p> : null}
                                {restorePreview ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Preview Backup</p>
                                        <p className="text-xs text-slate-600">File: {restorePreview.fileName}</p>
                                        <p className="text-xs text-slate-600">
                                            Exported: {restorePreview.exportedAt ? formatBackupDate(restorePreview.exportedAt) : 'Tidak diketahui'}
                                        </p>
                                        <p className="text-xs text-slate-600">
                                            Notifikasi: {restorePreview.includeNotifications ? 'Disertakan' : 'Tidak disertakan'}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            {Object.entries(restorePreview.counts).map(([key, value]) => (
                                                <div key={key} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{key}</p>
                                                    <p className="text-sm font-bold text-slate-800">{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void submitRestoreBackup()}
                                            disabled={restoreRunning}
                                            className="w-full h-11 rounded-xl bg-rose-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-rose-700 transition-colors"
                                        >
                                            {restoreRunning ? 'Memproses Restore...' : 'Restore Backup Ini'}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── ACCOUNT MANAGER MODAL ─── */}
            {isAccountManagerOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => { setIsAccountManagerOpen(false); setShowAccountForm(false); resetAccountForm(); }}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                {showAccountForm && (
                                    <button
                                        onClick={() => { setShowAccountForm(false); resetAccountForm(); }}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                )}
                                <p className="text-sm font-bold text-slate-800">
                                    {showAccountForm ? (editingAccountId ? 'Edit Rekening' : 'Tambah Rekening') : 'Daftar Rekening'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {!showAccountForm && (
                                    <button
                                        onClick={openAddAccount}
                                        className="h-8 px-3 rounded-lg bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    >
                                        <Plus size={12} /> Tambah
                                    </button>
                                )}
                                <button
                                    onClick={() => { setIsAccountManagerOpen(false); setShowAccountForm(false); resetAccountForm(); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Inline Form */}
                        {showAccountForm ? (
                            <div className="p-5 space-y-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                                        {accountForm.type === 'RDN' ? 'Nama Sekuritas (Broker)' : 'Nama Rekening'}
                                    </label>
                                    <input
                                        autoFocus
                                        value={accountForm.name}
                                        onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))}
                                        onKeyDown={(e) => e.key === 'Enter' && saveAccount()}
                                        placeholder={accountForm.type === 'RDN' ? 'cth: Ajaib, Stockbit' : 'cth: BCA Tabungan'}
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                                        {accountForm.type === 'RDN' ? 'Nomor RDN' : 'Nomor Rekening'} <span className="normal-case text-slate-400 font-normal">(opsional)</span>
                                    </label>
                                    <input
                                        value={accountForm.accountNumber}
                                        onChange={(e) => setAccountForm((p) => ({ ...p, accountNumber: e.target.value }))}
                                        placeholder={accountForm.type === 'RDN' ? 'cth: 0123456789 (BCA RDN)' : 'cth: 1234567890'}
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Kepemilikan</label>
                                        <select
                                            value={accountForm.ownerId}
                                            onChange={(e) => setAccountForm((p) => ({ ...p, ownerId: e.target.value }))}
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all bg-white"
                                        >
                                            <option value="" disabled>Pilih Owner</option>
                                            {meta.owners.map((owner) => (
                                                <option key={owner.id} value={owner.id}>{owner.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Tipe</label>
                                        <select
                                            value={accountForm.type}
                                            onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value }))}
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all bg-white"
                                        >
                                            {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Saldo Awal (Rp)</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formatThousands(accountForm.balance)}
                                        onChange={(e) => setAccountForm((p) => ({ ...p, balance: sanitizeAmount(e.target.value) }))}
                                        placeholder="0"
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Launcher Aplikasi</p>
                                        <p className="text-[11px] text-slate-500 mt-1">Siapkan tombol `Buka Aplikasi` untuk rekening ini.</p>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Preset Aplikasi</label>
                                        <select
                                            defaultValue=""
                                            onChange={(e) => {
                                                applyAccountPreset(e.target.value);
                                                e.currentTarget.value = '';
                                            }}
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all bg-white"
                                        >
                                            <option value="">Pilih preset opsional</option>
                                            {ACCOUNT_APP_PRESETS.map((preset) => (
                                                <option key={preset.key} value={preset.key}>{preset.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Package Name</label>
                                        <input
                                            value={accountForm.appPackageName}
                                            onChange={(e) => setAccountForm((p) => ({ ...p, appPackageName: e.target.value }))}
                                            placeholder="cth: id.co.bni.wondr"
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Deep Link</label>
                                        <input
                                            value={accountForm.appDeepLink}
                                            onChange={(e) => setAccountForm((p) => ({ ...p, appDeepLink: e.target.value }))}
                                            placeholder="cth: dana:// atau gojek://home"
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Store URL</label>
                                        <input
                                            value={accountForm.appStoreUrl}
                                            onChange={(e) => setAccountForm((p) => ({ ...p, appStoreUrl: e.target.value }))}
                                            placeholder="cth: https://play.google.com/store/apps/details?id=..."
                                            className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={saveAccount}
                                    disabled={saving}
                                    className="w-full h-11 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-blue-700 transition-colors mt-1"
                                >
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Rekening'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={accountQuery}
                                        onChange={(e) => setAccountQuery(e.target.value)}
                                        placeholder="Cari rekening..."
                                        className="w-full h-10 rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                                    />
                                </div>

                                {/* List */}
                                <div className="space-y-2">
                                    {paginatedAccounts.map((acc) => (
                                        <div key={acc.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getAccountColor(acc.type)}`}>
                                                    {getAccountIcon(acc.type)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{acc.name}</p>
                                                    <p className="text-[11px] text-slate-500 font-semibold">
                                                        {acc.type}
                                                        {acc.accountNumber ? ` · ···${acc.accountNumber.slice(-4)}` : ''}
                                                        {' · '}{formatCurrency(acc.balance)}
                                                    </p>
                                                    {canLaunchAccountApp(acc) ? (
                                                        <p className="text-[10px] font-semibold text-blue-600 mt-1">Launcher aktif</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {confirmDeleteAccountId === acc.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteAccount(acc.id)}
                                                            className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
                                                        >
                                                            Hapus
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteAccountId(null)}
                                                            className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                                                        >
                                                            Batal
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {canLaunchAccountApp(acc) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleLaunchAccount(acc)}
                                                                className="h-8 px-3 rounded-lg bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-colors"
                                                            >
                                                                <ExternalLink size={12} />
                                                                {launchingAccountId === acc.id ? 'Buka...' : 'Buka'}
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditAccount(acc)}
                                                            className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteAccountId(acc.id)}
                                                            className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredAccounts.length === 0 && (
                                        <div className="text-center py-8">
                                            <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
                                            <p className="text-sm text-slate-400">Rekening tidak ditemukan.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Pagination */}
                                {filteredAccounts.length > PAGE_SIZE && (
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-[11px] text-slate-500">Halaman {accountPage}/{totalAccountPages}</p>
                                        <div className="flex gap-2">
                                            <button type="button" disabled={accountPage === 1} onClick={() => setAccountPage((p) => Math.max(1, p - 1))} className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-50">Sebelumnya</button>
                                            <button type="button" disabled={accountPage === totalAccountPages} onClick={() => setAccountPage((p) => Math.min(totalAccountPages, p + 1))} className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-50">Berikutnya</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── ACTIVITY MANAGER MODAL ─── */}
            {isActivityManagerOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => { setIsActivityManagerOpen(false); setShowActivityForm(false); resetActivityForm(); }}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                {showActivityForm && (
                                    <button
                                        onClick={() => { setShowActivityForm(false); resetActivityForm(); }}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                )}
                                <p className="text-sm font-bold text-slate-800">
                                    {showActivityForm ? (editingActivityId ? 'Edit Kategori' : 'Tambah Kategori') : 'Daftar Kategori'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {!showActivityForm && (
                                    <button
                                        onClick={openAddActivity}
                                        className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    >
                                        <Plus size={12} /> Tambah
                                    </button>
                                )}
                                <button
                                    onClick={() => { setIsActivityManagerOpen(false); setShowActivityForm(false); resetActivityForm(); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Inline Form */}
                        {showActivityForm ? (
                            <div className="p-5 space-y-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Nama Kategori</label>
                                    <input
                                        autoFocus
                                        value={activityForm.name}
                                        onChange={(e) => setActivityForm({ name: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && saveActivity()}
                                        placeholder="cth: Makan & Minum"
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                                    />
                                </div>
                                <button
                                    onClick={saveActivity}
                                    disabled={saving}
                                    className="w-full h-11 rounded-xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-emerald-700 transition-colors mt-1"
                                >
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Kategori'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={activityQuery}
                                        onChange={(e) => setActivityQuery(e.target.value)}
                                        placeholder="Cari kategori..."
                                        className="w-full h-10 rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                                    />
                                </div>

                                {/* List */}
                                <div className="space-y-2">
                                    {paginatedActivities.map((activity) => (
                                        <div key={activity.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                                    <Tag size={14} />
                                                </div>
                                                <p className="text-sm font-semibold text-slate-800 truncate">{activity.name}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {confirmDeleteActivityId === activity.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteActivity(activity.id)}
                                                            className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
                                                        >
                                                            Hapus
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteActivityId(null)}
                                                            className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                                                        >
                                                            Batal
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditActivity(activity)}
                                                            className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteActivityId(activity.id)}
                                                            className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredActivities.length === 0 && (
                                        <div className="text-center py-8">
                                            <Tag size={32} className="mx-auto text-slate-300 mb-2" />
                                            <p className="text-sm text-slate-400">Kategori tidak ditemukan.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Pagination */}
                                {filteredActivities.length > PAGE_SIZE && (
                                    <div className="flex items-center justify-between pt-1">
                                        <p className="text-[11px] text-slate-500">Halaman {activityPage}/{totalActivityPages}</p>
                                        <div className="flex gap-2">
                                            <button type="button" disabled={activityPage === 1} onClick={() => setActivityPage((p) => Math.max(1, p - 1))} className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-50">Sebelumnya</button>
                                            <button type="button" disabled={activityPage === totalActivityPages} onClick={() => setActivityPage((p) => Math.min(totalActivityPages, p + 1))} className="h-8 px-3 rounded-lg border border-slate-200 text-xs disabled:opacity-40 hover:bg-slate-50">Berikutnya</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- Owner Manager Modal --- */}
            {isOwnerManagerOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center p-4">
                    <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="bg-slate-900 border-b border-slate-800 p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                                    <User size={20} />
                                </div>
                                <h2 className="text-lg font-bold tracking-tight">Anggota / Pemilik</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {!showOwnerForm && (
                                    <button
                                        onClick={openAddOwner}
                                        className="h-8 px-3 rounded-lg bg-violet-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    >
                                        <Plus size={12} /> Tambah
                                    </button>
                                )}
                                <button
                                    onClick={() => { setIsOwnerManagerOpen(false); setShowOwnerForm(false); resetOwnerForm(); }}
                                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Inline Form */}
                        {showOwnerForm ? (
                            <div className="p-5 space-y-3">
                                <div>
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Nama Pemilik/Anggota</label>
                                    <input
                                        autoFocus
                                        value={ownerForm.name}
                                        onChange={(e) => setOwnerForm({ name: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && saveOwner()}
                                        placeholder="cth: Suami, Istri, Anak"
                                        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
                                    />
                                </div>
                                <button
                                    onClick={saveOwner}
                                    disabled={saving}
                                    className="w-full h-11 rounded-xl bg-violet-600 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-violet-700 transition-colors mt-1"
                                >
                                    <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Pemilik'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
                                {/* Search */}
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={ownerQuery}
                                        onChange={(e) => setOwnerQuery(e.target.value)}
                                        placeholder="Cari pemilik..."
                                        className="w-full h-10 rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all"
                                    />
                                </div>

                                {/* List */}
                                <div className="space-y-2">
                                    {meta.owners.filter(o => o.name.toLowerCase().includes(ownerQuery.toLowerCase())).map((owner) => (
                                        <div key={owner.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                                    <User size={14} />
                                                </div>
                                                <p className="text-sm font-semibold text-slate-800 truncate">{owner.name}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {confirmDeleteOwnerId === owner.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteOwner(owner.id)}
                                                            className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors"
                                                        >
                                                            Hapus
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteOwnerId(null)}
                                                            className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                                                        >
                                                            Batal
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditOwner(owner)}
                                                            className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteOwnerId(owner.id)}
                                                            className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {meta.owners.filter(o => o.name.toLowerCase().includes(ownerQuery.toLowerCase())).length === 0 && (
                                        <div className="text-center py-8">
                                            <User size={32} className="mx-auto text-slate-300 mb-2" />
                                            <p className="text-sm text-slate-400">Pemilik tidak ditemukan.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- Reset Manager Modal --- */}
            {isResetModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center p-4">
                    <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="bg-slate-900 border-b border-rose-900 p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                                    <Trash2 size={20} />
                                </div>
                                <h2 className="text-lg font-bold tracking-tight text-rose-50">Reset Data</h2>
                            </div>
                            <button
                                onClick={() => {
                                    setResetFeedback(null);
                                    setResetConfirmationText('');
                                    setIsResetModalOpen(false);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            <p className="text-[11px] text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 font-medium">
                                Pilih data mana saja yang ingin dihapus. Jika rekening atau kategori dihapus, otomatis semua transaksi berelasi akan ikut terhapus untuk mencegah kerusakan basis data.
                            </p>

                            {resetFeedback ? (
                                <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${resetFeedback.type === 'error'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    }`}>
                                    {resetFeedback.message}
                                </div>
                            ) : null}

                            <div className="space-y-3">
                                {[
                                    { key: 'transactions', icon: <Wallet size={16} />, label: 'Transaksi & Riwayat Notifikasi', info: 'Semua history uang masuk, keluar, dan transfer beserta notifikasinya.' },
                                    { key: 'targets', icon: <Shield size={16} />, label: 'Target & Budget (Anggaran)', info: 'Semua misi keuangan dan perencanaan bulanan/tahunan.' },
                                    { key: 'categories', icon: <Tag size={16} />, label: 'Kategori / Aktivitas', info: 'Menghapus Daftar Pemasukan dan Pengeluaran.' },
                                    { key: 'accounts', icon: <CreditCard size={16} />, label: 'Rekening Bank, E-Wallet, RDN', info: 'Menghapus semua sumber dana Anda secara total.' },
                                    { key: 'owners', icon: <User size={16} />, label: 'Semua Pemilik / Anggota', info: 'Memerlukan reset total dari awal (Termasuk semua centang di atas).' },
                                ].map((opt) => (
                                    <label key={opt.key} className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer border-slate-200 transition-colors ${resetOptions[opt.key as keyof typeof resetOptions] ? 'bg-rose-50/50 border-rose-200' : 'bg-white hover:bg-slate-50'}`}>
                                        <div className="pt-1">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 accent-rose-600 rounded text-rose-600 focus:ring-rose-500"
                                                checked={resetOptions[opt.key as keyof typeof resetOptions]}
                                                onChange={(e) => handleResetOptionsChange(opt.key as keyof typeof resetOptions, e.target.checked)}
                                                disabled={(opt.key === 'transactions' && (resetOptions.categories || resetOptions.accounts || resetOptions.owners))}
                                            />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 text-slate-800">
                                                <div className="text-slate-400">{opt.icon}</div>
                                                <p className="text-sm font-bold">{opt.label}</p>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-relaxed">{opt.info}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                                <label htmlFor="reset-confirmation" className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                    Konfirmasi Penghapusan
                                </label>
                                <p className="text-xs text-slate-600">
                                    Ketik <span className="font-bold text-slate-900">RESET</span> untuk melanjutkan. Ini menggantikan popup konfirmasi agar lebih stabil di aplikasi Android.
                                </p>
                                <input
                                    id="reset-confirmation"
                                    type="text"
                                    value={resetConfirmationText}
                                    onChange={(e) => setResetConfirmationText(e.target.value)}
                                    placeholder="Ketik RESET"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 h-11 text-sm font-semibold uppercase tracking-[0.14em] text-slate-800"
                                    autoCapitalize="characters"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                            </div>

                            <button
                                onClick={submitGranularReset}
                                disabled={resetDataLoading}
                                className="w-full h-12 bg-rose-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-rose-700 hover:shadow-lg hover:shadow-rose-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                <Trash2 size={16} />
                                {resetDataLoading ? 'Menghapus...' : 'Eksekusi Hapus Data'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Keamanan Transaksi Modal ─────────────────────────── */}
            {isSecurityModalOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/65 p-4 backdrop-blur-sm sm:items-center"
                    onMouseDown={() => setIsSecurityModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] ring-1 ring-slate-200"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                                    <Lock size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Keamanan Transaksi</h3>
                                    <p className="text-[11px] text-slate-500">
                                        {isSecurityEnabled ? 'PIN aktif — transaksi & buka app terlindungi' : 'Belum ada PIN yang diatur'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setIsSecurityModalOpen(false)} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
                                <X size={16} />
                            </button>
                        </div>

                        {/* ─── Step: Menu ─────────────────────── */}
                        {securityPinStep === 'menu' && (
                            <div className="space-y-3">
                                {!isSecurityEnabled ? (
                                    <button
                                        className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 transition-colors text-left border border-rose-100"
                                        onClick={() => { setSecurityPinInput(''); setSecurityPinConfirm(''); setSecurityPinError(''); setSecurityPinStep('set-pin'); }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Shield size={18} className="text-rose-600 shrink-0" />
                                            <div>
                                                <span className="block text-sm font-semibold text-rose-800">Aktifkan PIN</span>
                                                <span className="block text-[11px] text-rose-600">Buat PIN 6 digit untuk melindungi transaksi</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-rose-400 shrink-0" />
                                    </button>
                                ) : (
                                    <>
                                        {/* Change PIN */}
                                        <button
                                            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left border border-slate-200"
                                            onClick={() => { setSecurityPinInput(''); setSecurityPinConfirm(''); setSecurityPinError(''); setSecurityPinStep('change-pin'); }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Shield size={18} className="text-slate-600 shrink-0" />
                                                <div>
                                                    <span className="block text-sm font-semibold text-slate-800">Ganti PIN</span>
                                                    <span className="block text-[11px] text-slate-500">Buat PIN baru untuk keamanan</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-slate-400 shrink-0" />
                                        </button>

                                        {/* Biometric Toggle */}
                                        <button
                                            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left border border-slate-200"
                                            onClick={async () => {
                                                if (isBiometricEnabled) {
                                                    removeBiometric();
                                                } else {
                                                    const ok = await setupBiometric();
                                                    if (ok) alert('Biometrik berhasil didaftarkan!');
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Smartphone size={18} className="text-slate-600 shrink-0" />
                                                <div>
                                                    <span className="block text-sm font-semibold text-slate-800">
                                                        {isBiometricEnabled ? 'Nonaktifkan Biometrik' : 'Aktifkan Biometrik'}
                                                    </span>
                                                    <span className="block text-[11px] text-slate-500">
                                                        {isBiometricEnabled ? 'Biometrik sedang aktif (klik untuk nonaktifkan)' : 'Daftarkan sidik jari / Face ID perangkat ini'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${isBiometricEnabled ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                                                <div className="w-5 h-5 rounded-full bg-white shadow mx-0.5" />
                                            </div>
                                        </button>

                                        {/* Disable Security */}
                                        <button
                                            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 transition-colors text-left border border-rose-100"
                                            onClick={async () => {
                                                const ok = await verifySecurity('Nonaktifkan Keamanan');
                                                if (ok) {
                                                    removeSecurity();
                                                    setIsSecurityModalOpen(false);
                                                    alert('Keamanan transaksi dinonaktifkan.');
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Trash2 size={18} className="text-rose-600 shrink-0" />
                                                <div>
                                                    <span className="block text-sm font-semibold text-rose-800">Nonaktifkan Keamanan</span>
                                                    <span className="block text-[11px] text-rose-500">Hapus PIN dan semua proteksi</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-rose-400 shrink-0" />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ─── Step: Set PIN ─────────────────────── */}
                        {(securityPinStep === 'set-pin' || securityPinStep === 'change-pin') && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">
                                        {securityPinStep === 'change-pin' ? 'PIN Baru (6 digit)' : 'Buat PIN (6 digit)'}
                                    </label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="••••••"
                                        className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-center text-xl font-bold tracking-[0.4em] outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                                        value={securityPinInput}
                                        onChange={(e) => { setSecurityPinInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setSecurityPinError(''); }}
                                    />
                                </div>
                                <button
                                    disabled={securityPinInput.length !== 6}
                                    className="w-full h-12 rounded-2xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                                    onClick={() => { setSecurityPinConfirm(''); setSecurityPinError(''); setSecurityPinStep('confirm-pin'); }}
                                >
                                    Lanjut — Konfirmasi PIN
                                </button>
                                <button onClick={() => setSecurityPinStep('menu')} className="w-full text-xs text-slate-400 font-semibold py-1">Kembali</button>
                            </div>
                        )}

                        {/* ─── Step: Confirm PIN ─────────────────────── */}
                        {securityPinStep === 'confirm-pin' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">Konfirmasi PIN</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="••••••"
                                        className={`h-12 w-full rounded-2xl border px-4 text-center text-xl font-bold tracking-[0.4em] outline-none ${securityPinError ? 'border-rose-400 ring-4 ring-rose-100' : 'border-slate-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'}`}
                                        value={securityPinConfirm}
                                        onChange={(e) => { setSecurityPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6)); setSecurityPinError(''); }}
                                    />
                                    {securityPinError && <p className="mt-2 text-xs text-rose-600 font-semibold">{securityPinError}</p>}
                                </div>
                                <button
                                    disabled={securityPinConfirm.length !== 6}
                                    className="w-full h-12 rounded-2xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                                    onClick={() => {
                                        if (securityPinInput !== securityPinConfirm) {
                                            setSecurityPinError('PIN tidak cocok. Coba lagi.');
                                            setSecurityPinConfirm('');
                                            return;
                                        }
                                        setupSecurity(securityPinInput);
                                        setIsSecurityModalOpen(false);
                                        alert('PIN berhasil diatur! Gunakan PIN ini saat membuka aplikasi dan menyimpan transaksi.');
                                    }}
                                >
                                    <Save size={16} /> Simpan PIN
                                </button>
                                <button onClick={() => setSecurityPinStep('set-pin')} className="w-full text-xs text-slate-400 font-semibold py-1">Kembali</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MenuPage;
