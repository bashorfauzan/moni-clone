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
    Download
} from 'lucide-react';
import { useTheme, THEME_PRESETS } from '../context/ThemeContext';
import { fetchMasterMeta, type Owner, type Account, type Activity } from '../services/masterData';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    buildBackupFilename,
    downloadBackupBlob,
    exportBackupJson,
    loadBackupSettings,
    saveBackupSettings,
    shouldRunAutoBackup,
    type BackupSettings
} from '../services/backup';

const ACCOUNT_TYPES = ['Bank', 'E-Wallet', 'RDN', 'Sekuritas'];
const PAGE_SIZE = 6;

const MenuPage = () => {
    const [meta, setMeta] = useState<{ owners: Owner[]; accounts: Account[]; activities: Activity[] }>({ owners: [], accounts: [], activities: [] });
    const location = useLocation();
    const navigate = useNavigate();
    const { signOut } = useAuth();
    const {
        bgColor,
        bgImage,
        heroColor,
        heroCardImage,
        bgOverlay,
        bgBlur,
        heroImageMode,
        setBgColor,
        setBgImage,
        setHeroColor,
        setHeroCardImage,
        setBgOverlay,
        setBgBlur,
        setHeroImageMode
    } = useTheme();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Account Manager
    const [accountForm, setAccountForm] = useState({ name: '', type: 'Bank', accountNumber: '', balance: '', ownerId: '' });
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
    const [activeThemePanel, setActiveThemePanel] = useState<'app' | 'hero'>('app');
    const [backupSettings, setBackupSettings] = useState<BackupSettings>(() => loadBackupSettings());
    const [backupRunning, setBackupRunning] = useState(false);
    const [backupError, setBackupError] = useState('');
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
    const [resetOptions, setResetOptions] = useState({
        transactions: true,
        targets: true,
        categories: false,
        accounts: false,
        owners: false
    });

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
                const maxDimension = 1600;
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
                resolve(canvas.toDataURL('image/jpeg', 0.78));
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
        setAccountForm({ name: '', type: 'Bank', accountNumber: '', balance: '', ownerId: meta.owners[0]?.id || '' });
        setEditingAccountId(null);
    };

    const openAddAccount = () => {
        resetAccountForm();
        setShowAccountForm(true);
    };

    const openEditAccount = (acc: any) => {
        setEditingAccountId(acc.id);
        setAccountForm({ name: acc.name, type: acc.type, accountNumber: acc.accountNumber || '', balance: String(acc.balance), ownerId: acc.ownerId || meta.owners[0]?.id || '' });
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
                balance: Number(accountForm.balance || 0),
                ownerId: accountForm.ownerId || meta.owners[0].id,
            };
            if (editingAccountId) {
                await api.put(`/master/accounts/${editingAccountId}`, payload);
            } else {
                await api.post('/master/accounts', payload);
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
            await api.delete(`/master/accounts/${id}`);
            setConfirmDeleteAccountId(null);
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus rekening');
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
                await api.put(`/master/activities/${editingActivityId}`, { name: activityForm.name.trim() });
            } else {
                await api.post('/master/activities', { name: activityForm.name.trim() });
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
            await api.delete(`/master/activities/${id}`);
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
                await api.put(`/master/owners/${editingOwnerId}`, { name: ownerForm.name.trim() });
            } else {
                await api.post('/master/owners', { name: ownerForm.name.trim() });
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
            await api.delete(`/master/owners/${id}`);
            setConfirmDeleteOwnerId(null);
            await fetchMeta();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus pemilik');
        }
    };

    const handleResetOptionsChange = (key: keyof typeof resetOptions, value: boolean) => {
        let newOptions = { ...resetOptions, [key]: value };

        // Auto-check dependencies logic
        if (key === 'owners' && value) {
            newOptions = { transactions: true, targets: true, categories: true, accounts: true, owners: true };
        } else if ((key === 'accounts' || key === 'categories') && value) {
            newOptions.transactions = true;
        }

        setResetOptions(newOptions);
    };

    const submitGranularReset = async () => {
        if (!Object.values(resetOptions).some(v => v)) {
            alert("Pilih minimal 1 data yang ingin dihapus.");
            return;
        }
        const confirm1 = window.confirm("PERINGATAN! Data terpilih akan dihapus SELAMANYA. Apakah Anda yakin?");
        if (!confirm1) return;
        const check = window.prompt("Ketik 'RESET' untuk mengeksekusi penghapusan:");
        if (check !== "RESET") { alert("Reset dibatalkan."); return; }

        setResetDataLoading(true);
        try {
            await api.post('/master/reset-data', {
                resetTransactions: resetOptions.transactions,
                resetNotifications: resetOptions.transactions,
                resetTargets: resetOptions.targets,
                resetAccounts: resetOptions.accounts,
                resetActivities: resetOptions.categories,
                resetOwners: resetOptions.owners
            });
            alert("Data berhasil direset!");
            window.location.reload();
        } catch (error: any) {
            alert(error?.response?.data?.error || "Gagal mereset data.");
        } finally {
            setResetDataLoading(false);
            setIsResetModalOpen(false);
        }
    };

    const mainOwner = meta.owners[0] || { name: 'User' };

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

    useEffect(() => {
        if (!shouldRunAutoBackup(backupSettings) || backupRunning) return;
        void handleBackupNow('auto');
    }, [backupRunning, backupSettings, handleBackupNow]);

    if (loading) return (
        <div className="p-8 text-center text-slate-500 uppercase font-bold text-xs tracking-widest">
            Memuat Profil...
        </div>
    );

    return (
        <div className="px-3 py-4 sm:p-4 md:p-8 space-y-5 sm:space-y-6 pb-28 sm:pb-32 mx-auto w-full max-w-2xl relative">
            {/* Header */}
            <header className="app-surface-card rounded-[28px] px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Pengaturan Umum</p>
                        <p className="text-sm text-slate-600 mt-1">Atur data master, tampilan, dan preferensi akun dalam satu tempat.</p>
                    </div>
                    <div className="w-fit shrink-0 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-600 shadow-sm">
                        Moni Clone
                    </div>
                </div>
            </header>

            {/* Profile Card */}
            <div className="app-hero-card rounded-3xl p-4 sm:p-6 flex items-center gap-3 sm:gap-5 min-h-[132px] sm:min-h-[148px]">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl font-bold shadow-lg shrink-0" style={{ background: 'linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-hero-glow) 100%)', boxShadow: '0 16px 28px -18px color-mix(in srgb, var(--theme-accent) 70%, transparent)' }}>
                    {mainOwner.name.substring(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{mainOwner.name}</h2>
                    <p className="text-white/55 text-xs font-semibold">Premium Member</p>
                    <div className="mt-2 text-[10px] px-3 py-1 rounded-full w-fit font-bold uppercase tracking-tighter border text-white" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)', borderColor: 'color-mix(in srgb, var(--theme-accent) 30%, white 10%)' }}>
                        Keamanan Aktif
                    </div>
                </div>
                <button className="p-2.5 rounded-xl text-white/60 hover:text-white transition-colors shrink-0" style={{ backgroundColor: 'color-mix(in srgb, white 8%, transparent)' }}>
                    <Settings size={18} />
                </button>
            </div>

            {/* Settings List */}
            <section className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-1">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Daftar Pengaturan</h3>
                    <p className="text-[11px] text-slate-500">Rapi dan tetap terbaca.</p>
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
                            <span className="text-sm font-semibold text-slate-800 truncate">Setup Rekening</span>
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
                            <span className="text-sm font-semibold text-slate-800 truncate">Setup Kategori</span>
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
                            <span className="text-sm font-semibold text-slate-800 truncate">Setup Anggota / Pemilik</span>
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
                            <span className="text-sm font-semibold text-slate-800 truncate">Tema & Tampilan</span>
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
                    <button className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/55 transition-colors border-b border-white/50 text-left">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                                <User size={16} />
                            </div>
                            <span className="text-sm font-semibold text-slate-800 truncate">Bantuan & Dukungan</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-400" />
                    </button>

                    {/* Reset Data */}
                    <button
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-rose-50/80 transition-colors text-left"
                        onClick={() => setIsResetModalOpen(true)}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                                <Trash2 size={16} />
                            </div>
                            <span className="text-sm font-semibold text-rose-700 truncate">Reset & Pemulihan Data</span>
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
                <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest">Moni Clone v1.0.0</p>
                <p className="text-slate-500 text-[10px] italic mt-1">Design by bashorfauzan</p>
            </div>

            {isThemeCustomizerOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onMouseDown={() => setIsThemeCustomizerOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onMouseDown={(e) => e.stopPropagation()}
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
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                                            {activeThemePanel === 'app' ? 'Background App' : 'Kartu Utama'}
                                        </p>
                                        <p className="text-sm font-semibold text-slate-900 mt-1">
                                            {activeThemePanel === 'app' ? 'Warna dan gambar halaman utama' : 'Warna dan gambar hero card utama'}
                                        </p>
                                    </div>
                                    <div
                                        className="w-full sm:w-24 aspect-[16/9] sm:h-14 sm:aspect-auto rounded-2xl border border-white/70 shadow-sm bg-center bg-cover"
                                        style={{
                                            backgroundColor: activeThemePanel === 'app' ? bgColor : heroColor,
                                            backgroundImage: activeThemePanel === 'app'
                                                ? (bgImage ? `url(${bgImage})` : 'none')
                                                : (heroCardImage ? `url(${heroCardImage})` : 'none')
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveThemePanel('app')}
                                    className={`h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeThemePanel === 'app' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Background App
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveThemePanel('hero')}
                                    className={`h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${activeThemePanel === 'hero' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Kartu Utama
                                </button>
                            </div>

                            {activeThemePanel === 'app' ? (
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

            {isBackupSettingsOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onMouseDown={() => setIsBackupSettingsOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-white rounded-t-[28px] sm:rounded-[28px] border border-slate-200 shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[88dvh] flex flex-col"
                        onMouseDown={(e) => e.stopPropagation()}
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
                        </div>
                    </div>
                </div>
            )}

            {/* ─── ACCOUNT MANAGER MODAL ─── */}
            {isAccountManagerOpen && (
                <div
                    className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onMouseDown={() => { setIsAccountManagerOpen(false); setShowAccountForm(false); resetAccountForm(); }}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
                        onMouseDown={(e) => e.stopPropagation()}
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
                    onMouseDown={() => { setIsActivityManagerOpen(false); setShowActivityForm(false); resetActivityForm(); }}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
                        onMouseDown={(e) => e.stopPropagation()}
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
                                onClick={() => setIsResetModalOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            <p className="text-[11px] text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 font-medium">
                                Pilih data mana saja yang ingin dihapus. Jika rekening atau kategori dihapus, otomatis semua transaksi berelasi akan ikut terhapus untuk mencegah kerusakan basis data.
                            </p>

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
        </div>
    );
};

export default MenuPage;
