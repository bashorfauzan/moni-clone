import { X, Bell } from 'lucide-react';
import type { NotificationItem } from '../services/notificationInbox';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationItem[];
    onClearAll: () => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onRejectTransaction: (txId: string) => Promise<void>;
    onMakeTransaction: (item: NotificationItem) => void;
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

const notificationTone = (status: NotificationItem['parseStatus']) => {
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
    onClearAll,
    onDelete,
    onRejectTransaction,
    onMakeTransaction,
    clearingNotifications,
    deletingNotificationId
}: NotificationDrawerProps) => {

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

                    {notifications.length > 0 ? (
                        notifications.map((item) => {
                            const tone = notificationTone(item.parseStatus);
                            return (
                                <div key={item.id} className={`border rounded-2xl p-4 shadow-sm ${tone.shell}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`}></span>
                                                <p className="text-sm font-bold text-slate-900 line-clamp-1">
                                                    {item.title || item.senderName || item.sourceApp}
                                                </p>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${tone.badge}`}>
                                                    {item.parseStatus}
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
                                                {item.parsedType}
                                            </span>
                                        ) : null}
                                        {item.parsedAccountHint ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                Rekening: {item.parsedAccountHint}
                                            </span>
                                        ) : null}
                                        {typeof item.confidenceScore === 'number' ? (
                                            <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 border border-white font-bold uppercase tracking-wide text-slate-600">
                                                Confidence: {Math.round(item.confidenceScore * 100)}%
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

                                    {item.parseNotes ? (
                                        <p className="text-[11px] text-slate-500 mt-3 font-medium">
                                            💡 {item.parseNotes}
                                        </p>
                                    ) : null}

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
                                            <button
                                                type="button"
                                                onClick={() => onMakeTransaction(item)}
                                                className="h-8 px-3 rounded-lg bg-blue-600 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors shadow-sm"
                                            >
                                                {item.transaction ? 'Verifikasi' : 'Buat Transaksi'}
                                            </button>
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
                            <p className="text-sm font-semibold text-slate-600">Inbox Kosong</p>
                            <p className="text-xs max-w-[200px] mx-auto mt-1">Belum ada notifikasi otomatis yang masuk hari ini.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationDrawer;
