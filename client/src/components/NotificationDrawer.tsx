import { X, Bell, PencilLine } from 'lucide-react';
import { useState } from 'react';
import type { NotificationItem } from '../services/notificationInbox';
import type { Account } from '../services/masterData';
import { inferNotificationCategoryLabel, normalizeTransactionType } from '../lib/transactionRules';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationItem[];
    accounts: Account[];
    onClearAll: () => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onRejectTransaction: (txId: string) => Promise<void>;
    onMakeTransaction: (item: NotificationItem, overrideAmount?: number) => void;
    clearingNotifications: boolean;
    deletingNotificationId: string | null;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value).replace('Rp', 'Rp ');
};

const formatCompactTime = (value: string) => new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
});

const formatParsedTypeLabel = (value?: string) => {
    if (!value) return '';
    const normalized = normalizeTransactionType(value) || value;
    const labels: Record<string, string> = {
        INCOME: 'Pemasukan',
        EXPENSE: 'Pengeluaran',
        TRANSFER: 'Transfer'
    };
    return labels[normalized] || normalized;
};

const formatConfidenceLabel = (value?: number) => {
    if (typeof value !== 'number') return null;
    if (value >= 0.8) return 'Tinggi';
    if (value >= 0.6) return 'Sedang';
    return 'Rendah';
};

const getParserSummary = (item: NotificationItem) => {
    const normalizedType = normalizeTransactionType(item.parsedType) || item.parsedType;
    if (normalizedType === 'INCOME') return 'Parser menduga ini dana masuk ke rekening tujuan.';
    if (normalizedType === 'EXPENSE') return 'Parser menduga ini dana keluar dari rekening sumber.';
    if (normalizedType === 'TRANSFER') return 'Parser menduga ini perpindahan dana antar rekening atau ke investasi.';
    if (item.parseStatus === 'FAILED') return 'Parser belum berhasil mengklasifikasikan notifikasi ini.';
    return 'Parser masih membutuhkan konfirmasi tambahan.';
};

const getSuggestedActionText = (item: NotificationItem) => {
    const normalizedType = normalizeTransactionType(item.parsedType) || item.parsedType;
    if (item.transaction?.isValidated) return 'Sudah tercatat, biasanya tidak perlu tindakan lagi.';
    if (item.transaction && !item.transaction.isValidated) return 'Periksa rekening dan kategori, lalu setujui transaksi pending ini.';
    if (!item.parsedAmount && normalizedType) return 'Lengkapi nominal dulu, lalu buat transaksi dari notifikasi ini.';
    if (normalizedType === 'INCOME') return 'Cek rekening tujuan, lalu simpan sebagai pemasukan.';
    if (normalizedType === 'EXPENSE') return 'Cek rekening sumber, lalu simpan sebagai pengeluaran.';
    if (normalizedType === 'TRANSFER') return 'Cek rekening sumber dan tujuan, lalu simpan sebagai transfer.';
    if (item.parseStatus === 'IGNORED') return 'Notifikasi ini sengaja diabaikan dan tidak akan mengubah saldo.';
    return 'Tinjau manual untuk memastikan jenis transaksi dan rekeningnya benar.';
};

const notificationTone = (status: NotificationItem['parseStatus'], isSecurityAlert?: boolean) => {
    if (isSecurityAlert) {
        return {
            shell: 'bg-orange-50 border-orange-200',
            badge: 'bg-orange-100 text-orange-700',
            dot: 'bg-orange-500'
        };
    }
    switch (status) {
        case 'PARSED':
            return {
                shell: 'bg-emerald-50 border-emerald-200',
                badge: 'bg-emerald-100 text-emerald-700',
                dot: 'bg-emerald-500'
            };
        case 'PENDING':
            return {
                shell: 'bg-amber-50 border-amber-200',
                badge: 'bg-amber-100 text-amber-700',
                dot: 'bg-amber-500'
            };
        case 'IGNORED':
            return {
                shell: 'bg-slate-50 border-slate-200',
                badge: 'bg-slate-200 text-slate-600',
                dot: 'bg-slate-400'
            };
        default:
            return {
                shell: 'bg-rose-50 border-rose-200',
                badge: 'bg-rose-100 text-rose-700',
                dot: 'bg-rose-500'
            };
    }
};

const NotificationDrawer = ({
    isOpen,
    onClose,
    notifications,
    accounts,
    onClearAll,
    onDelete,
    onRejectTransaction,
    onMakeTransaction,
    clearingNotifications,
    deletingNotificationId
}: NotificationDrawerProps) => {
    // State untuk inline-form "Lengkapi Transaksi" (untuk notif tanpa nominal)
    const [completingId, setCompletingId] = useState<string | null>(null);
    const [completeAmount, setCompleteAmount] = useState('');
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'REVIEW' | 'APPROVED' | 'IGNORED'>('ALL');

    const handleCompleteSubmit = (item: NotificationItem) => {
        const amount = Number(completeAmount.replace(/[^0-9]/g, ''));
        if (!amount || amount <= 0) {
            alert('Masukkan nominal yang valid.');
            return;
        }
        setCompletingId(null);
        setCompleteAmount('');
        onMakeTransaction(item, amount);
    };

    // Cari account yang cocok berdasarkan sourceApp hint
    const resolveSourceAccount = (sourceApp: string): Account | undefined => {
        const lower = sourceApp.toLowerCase();
        return accounts.find(acc =>
            acc.name.toLowerCase().includes(lower) ||
            (acc.appPackageName ?? '').toLowerCase().includes(lower) ||
            acc.type.toLowerCase().includes(lower)
        );
    };

    const resolveHintAccount = (hint?: string): Account | undefined => {
        if (!hint) return undefined;
        const lower = hint.toLowerCase();
        return accounts.find((acc) =>
            acc.name.toLowerCase().includes(lower)
            || acc.type.toLowerCase().includes(lower)
            || (acc.accountNumber ?? '').toLowerCase().includes(lower)
        );
    };

    const getNotificationBucket = (item: NotificationItem): 'REVIEW' | 'APPROVED' | 'IGNORED' => {
        if (item.parseStatus === 'IGNORED') return 'IGNORED';
        if (item.transaction?.isValidated || item.parseStatus === 'PARSED') return 'APPROVED';
        return 'REVIEW';
    };

    const filterCounts = notifications.reduce((acc, item) => {
        const bucket = getNotificationBucket(item);
        acc.ALL += 1;
        acc[bucket] += 1;
        return acc;
    }, {
        ALL: 0,
        REVIEW: 0,
        APPROVED: 0,
        IGNORED: 0
    });

    const visibleNotifications = notifications.filter((item) =>
        activeFilter === 'ALL' ? true : getNotificationBucket(item) === activeFilter
    );

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[100] flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity sm:items-center p-0 sm:p-4"
            onMouseDown={onClose}
        >
            <div 
                className="w-full h-[90vh] mt-[10vh] sm:mt-0 sm:h-full max-h-screen bg-slate-50 rounded-t-[28px] sm:rounded-3xl sm:max-w-md shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-right duration-300"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* Header Drawer */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-white rounded-t-[28px] sm:rounded-t-3xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Bell size={18} className="fill-blue-100" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Inbox Notifikasi</h2>
                            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Notifikasi Auto</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                        aria-label="Tutup"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Action Bar */}
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => void onClearAll()}
                            disabled={clearingNotifications || notifications.length === 0}
                            className="app-action-chip rounded-full px-3 py-2 text-[10px] text-rose-600 font-bold uppercase tracking-wide disabled:opacity-50"
                        >
                            {clearingNotifications ? 'Membersihkan...' : 'Kosongkan Inbox'}
                        </button>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                        {[
                            { key: 'ALL', label: 'Semua', tone: 'bg-slate-100 text-slate-600' },
                            { key: 'REVIEW', label: 'Perlu Review', tone: 'bg-amber-100 text-amber-700' },
                            { key: 'APPROVED', label: 'Siap / Valid', tone: 'bg-emerald-100 text-emerald-700' },
                            { key: 'IGNORED', label: 'Diabaikan', tone: 'bg-slate-200 text-slate-600' }
                        ].map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setActiveFilter(item.key as typeof activeFilter)}
                                className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                    activeFilter === item.key ? item.tone : 'bg-white text-slate-500 border border-slate-200'
                                }`}
                            >
                                {item.label} ({filterCounts[item.key as keyof typeof filterCounts]})
                            </button>
                        ))}
                    </div>

                    {visibleNotifications.length > 0 ? (
                        visibleNotifications.map((item) => {
                            const isSecurityAlert = item.parseStatus === 'FAILED' && !item.parsedAmount && (item.parseNotes?.includes('Peringatan Keamanan') ?? false);
                            const tone = notificationTone(item.parseStatus, isSecurityAlert);
                            const confidenceLabel = formatConfidenceLabel(item.confidenceScore);
                            const suggestedCategory = inferNotificationCategoryLabel({
                                title: item.title,
                                messageText: item.messageText,
                                sourceApp: item.sourceApp,
                                parsedType: item.parsedType
                            });
                            const sourceAccount = resolveSourceAccount(item.sourceApp);
                            const hintedAccount = resolveHintAccount(item.parsedAccountHint);
                            return (
                                <div key={item.id} className={`border rounded-2xl p-4 shadow-sm ${tone.shell}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                {isSecurityAlert ? (
                                                    <span className="text-base">🛡️</span>
                                                ) : (
                                                    <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`}></span>
                                                )}
                                                <p className="text-sm font-bold text-slate-900 line-clamp-1">
                                                    {item.title || item.senderName || item.sourceApp}
                                                </p>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${tone.badge}`}>
                                                    {isSecurityAlert ? 'KEAMANAN' : item.parseStatus}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                {item.messageText}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                                                {formatCompactTime(item.receivedAt)}
                                            </p>
                                            {item.parsedAmount ? (
                                                <p className="text-sm font-bold text-slate-900 mt-2">
                                                    {formatCurrency(item.parsedAmount)}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {item.parsedType ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                {formatParsedTypeLabel(item.parsedType)}
                                            </span>
                                        ) : null}
                                        {suggestedCategory ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                Saran: {suggestedCategory}
                                            </span>
                                        ) : null}
                                        {item.parsedAccountHint ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                Rekening: {item.parsedAccountHint}
                                            </span>
                                        ) : null}
                                        {typeof item.confidenceScore === 'number' ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                Confidence: {Math.round(item.confidenceScore * 100)}%{confidenceLabel ? ` • ${confidenceLabel}` : ''}
                                            </span>
                                        ) : null}
                                        {item.transaction ? (
                                            <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide ${item.transaction.isValidated ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                {item.transaction.isValidated ? 'Transaksi Valid' : 'Menunggu Persetujuan'}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold uppercase tracking-wide">
                                                Belum Jadi Transaksi
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 rounded-xl bg-white/70 border border-white px-3 py-2.5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ringkasan Parser</p>
                                        <p className="mt-1 text-[11px] font-medium text-slate-600">
                                            {getParserSummary(item)}
                                        </p>
                                        {sourceAccount ? (
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Sumber aplikasi cocok ke rekening: <span className="font-semibold text-slate-700">{sourceAccount.name}</span>
                                            </p>
                                        ) : null}
                                        {hintedAccount ? (
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Hint rekening terdeteksi: <span className="font-semibold text-slate-700">{hintedAccount.name}</span>
                                            </p>
                                        ) : null}
                                        {item.parsedDescription ? (
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Catatan: {item.parsedDescription}
                                            </p>
                                        ) : null}
                                        {item.parseNotes ? (
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Alasan: {item.parseNotes}
                                            </p>
                                        ) : null}
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            Saran tindakan: <span className="font-semibold text-slate-700">{getSuggestedActionText(item)}</span>
                                        </p>
                                    </div>

                                    {/* === INLINE "Lengkapi Transaksi" untuk notif tanpa nominal === */}
                                    {!item.transaction && !item.parsedAmount && item.parsedType && !isSecurityAlert && (
                                        <div className="mt-3 border-t border-rose-100 pt-3">
                                            {completingId === item.id ? (
                                                <div className="flex flex-col gap-2">
                                                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                                                        Masukkan Nominal Transaksi
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1 relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pointer-events-none">Rp</span>
                                                            <input
                                                                type="number"
                                                                inputMode="numeric"
                                                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-rose-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-400"
                                                                placeholder="0"
                                                                value={completeAmount}
                                                                onChange={e => setCompleteAmount(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleCompleteSubmit(item)}
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCompleteSubmit(item)}
                                                            className="h-9 px-3 rounded-lg bg-rose-500 text-white text-[11px] font-bold uppercase tracking-wide hover:bg-rose-600 transition-colors shadow-sm shrink-0"
                                                        >
                                                            Buat
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setCompletingId(null); setCompleteAmount(''); }}
                                                            className="h-9 px-2 rounded-lg bg-white border border-slate-200 text-slate-400 text-[11px] font-bold hover:bg-slate-50 transition-colors shrink-0"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    {/* Tampilkan rekening yang akan di-prefill */}
                                                    {(() => {
                                                        const srcAcc = resolveSourceAccount(item.sourceApp);
                                                        return srcAcc ? (
                                                            <p className="text-[10px] text-slate-400 font-medium">
                                                                Dari rekening: <span className="font-bold text-slate-600">{srcAcc.name}</span>
                                                            </p>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCompletingId(item.id);
                                                        setCompleteAmount('');
                                                    }}
                                                    className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-bold uppercase tracking-wide transition-colors border border-rose-200"
                                                >
                                                    <PencilLine size={13} />
                                                    Lengkapi Nominal &amp; Buat Transaksi
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {(!item.transaction || !item.transaction.isValidated) ? (
                                        <div className="mt-3 flex justify-end gap-2 border-t border-black/5 pt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (item.transaction) {
                                                        void onRejectTransaction(item.transaction.id);
                                                    } else {
                                                        void onDelete(item.id);
                                                    }
                                                }}
                                                disabled={!!(deletingNotificationId === item.id || (item.transaction && deletingNotificationId === item.transaction.id))}
                                                className="h-8 px-3 rounded-lg bg-white/50 hover:bg-white text-[11px] font-bold uppercase tracking-wide text-rose-600 transition-colors disabled:opacity-50"
                                            >
                                                {deletingNotificationId === item.id ? 'Menghapus...' : 'Hapus / Tolak'}
                                            </button>
                                            {!isSecurityAlert && (
                                                <button
                                                    type="button"
                                                    onClick={() => onMakeTransaction(item)}
                                                    className="h-8 px-3 rounded-lg bg-blue-600 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors shadow-sm"
                                                >
                                                    {item.transaction ? 'Periksa' : item.parseStatus === 'PENDING' ? 'Tinjau & Buat' : 'Buat Transaksi'}
                                                </button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 h-64">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                <Bell size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600">
                                {notifications.length === 0 ? 'Inbox Kosong' : 'Tidak ada item di filter ini'}
                            </p>
                            <p className="text-xs max-w-[220px] mx-auto mt-1">
                                {notifications.length === 0
                                    ? 'Belum ada notifikasi otomatis yang masuk hari ini.'
                                    : 'Coba ganti filter untuk melihat notifikasi pada status lain.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationDrawer;
