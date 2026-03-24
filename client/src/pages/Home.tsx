import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useTransaction } from '../context/TransactionContext';
import {
    clearNotificationInbox,
    deleteNotificationInboxItem,
    fetchNotificationInbox,
    type NotificationItem
} from '../services/notificationInbox';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import { fetchTransactions, type TransactionItem } from '../services/transactions';
import { Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { subscribeTableChanges } from '../services/realtime';
import { canLaunchAccountApp, launchAccountApp } from '../services/accountLauncher';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

const Home = () => {
    const { openModal } = useTransaction();
    const { user } = useAuth();
    const [meta, setMeta] = useState<{ owners: Owner[]; accounts: Account[] }>({ owners: [], accounts: [] });
    const [summaryData, setSummaryData] = useState({
        liquidBalance: 0,
        incomeMonth: 0,
        expenseMonth: 0
    });
    const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
    const [allRecentTransactions, setAllRecentTransactions] = useState<TransactionItem[] | null>(null);
    const [pendingTransactions, setPendingTransactions] = useState<TransactionItem[]>([]);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const isBalanceHidden = localStorage.getItem('hideBalance') === 'true';
    const [isWealthHidden, setIsWealthHidden] = useState(() => localStorage.getItem('hideWealth') === 'true');
    const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
    const [launchingAccountId, setLaunchingAccountId] = useState<string | null>(null);
    const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
    const [clearingNotifications, setClearingNotifications] = useState(false);
    const [isShowingAllRecent, setIsShowingAllRecent] = useState(false);
    const [loadingAllRecent, setLoadingAllRecent] = useState(false);
    const refreshTimeoutRef = useRef<number | null>(null);

    const toggleHideWealth = () => {
        setIsWealthHidden(prev => {
            const val = !prev;
            localStorage.setItem('hideWealth', String(val));
            return val;
        });
    };

    const fetchData = async () => {
        try {
            const [nextRecentTransactions, allValidatedTransactions, nextPendingTransactions, meta, nextNotifications] = await Promise.all([
                fetchTransactions({ validated: true, limit: 20 }),
                fetchTransactions({ validated: true }),
                fetchTransactions({ validated: false, limit: 20 }),
                fetchMasterMeta(),
                fetchNotificationInbox(8)
            ]);
            const isInvestmentAccount = (accountType?: string) => accountType === 'RDN' || accountType === 'Sekuritas';
            const isInvestmentIncome = (tx: TransactionItem) => tx.type === 'INCOME' && isInvestmentAccount(tx.destinationAccount?.type);
            const totalIncome = allValidatedTransactions
                .filter((tx: any) => tx.type === 'INCOME')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const totalExpense = allValidatedTransactions
                .filter((tx: any) => tx.type === 'EXPENSE')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const liquidBalance = totalIncome - totalExpense;

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const isCurrentMonth = (value: string) => {
                const txDate = new Date(value);
                return txDate >= startOfMonth && txDate < endOfMonth;
            };

            const incomeMonth = allValidatedTransactions
                .filter((tx: any) => tx.type === 'INCOME' && !isInvestmentIncome(tx) && isCurrentMonth(tx.date))
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const expenseMonth = allValidatedTransactions
                .filter((tx: any) => tx.type === 'EXPENSE' && isCurrentMonth(tx.date))
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            setSummaryData({ liquidBalance, incomeMonth, expenseMonth });
            setRecentTransactions(nextRecentTransactions);
            setPendingTransactions(nextPendingTransactions);
            setNotifications(nextNotifications);
            setMeta({ owners: meta.owners, accounts: meta.accounts });
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const scheduleRefresh = () => {
            if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current);
            }

            refreshTimeoutRef.current = window.setTimeout(() => {
                void fetchData();
            }, 400);
        };

        const unsubscribeNotifications = subscribeTableChanges(
            'home-notification-inbox',
            'NotificationInbox',
            scheduleRefresh
        );
        const unsubscribeTransactions = subscribeTableChanges(
            'home-transactions',
            'Transaction',
            scheduleRefresh
        );

        return () => {
            unsubscribeNotifications();
            unsubscribeTransactions();
            if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []);

    const handleValidate = async (id: string, action: 'APPROVE' | 'REJECT', tx: any) => {
        try {
            // For MVP, we send back the same data, but user could ideally edit it in a modal
            await api.put(`/transactions/${id}/validate`, {
                action,
                sourceAccountId: tx.sourceAccountId,
                destinationAccountId: tx.destinationAccountId,
                categoryId: tx.activityId,
                amount: tx.amount,
                type: tx.type
            });
            fetchData(); // Refresh data after approval/rejection
        } catch (error) {
            console.error('Error validating transaction:', error);
            alert('Gagal memvalidasi transaksi');
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(value).replace('Rp', 'Rp ');
    };

    const displayCurrency = (value: number) => {
        return isBalanceHidden ? 'Rp •••••••' : formatCurrency(value);
    };

    const formatCompactTime = (value: string) => new Date(value).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

    const getRecentTransactionAccountInfo = (tx: TransactionItem) => {
        const source = tx.sourceAccount?.name;
        const destination = tx.destinationAccount?.name;

        if (tx.type === 'TRANSFER' && source && destination) {
            return `${source} -> ${destination}`;
        }

        if ((tx.type === 'INCOME' || tx.type === 'INVESTMENT_IN') && destination) {
            return destination;
        }

        if ((tx.type === 'EXPENSE' || tx.type === 'INVESTMENT' || tx.type === 'INVESTMENT_OUT') && source) {
            return source;
        }

        return destination || source || tx.owner?.name || 'Rekening belum terhubung';
    };

    const wealthDistribution = meta.owners.map(owner => {
        const ownerAccounts = meta.accounts.filter(acc => acc.ownerId === owner.id && (acc.type === 'Bank' || acc.type === 'E-Wallet'));
        const total = ownerAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        return { ...owner, total, accountCount: ownerAccounts.length, accounts: ownerAccounts };
    }).sort((a, b) => b.total - a.total);

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

    const displayName = (
        user?.user_metadata?.full_name
        || user?.user_metadata?.name
        || user?.email?.split('@')[0]
        || meta.owners[0]?.name
        || 'User'
    ) as string;

    const greeting = (() => {
        const hour = new Date().getHours();
        if (hour >= 4 && hour < 11) return 'Selamat pagi';
        if (hour >= 11 && hour < 15) return 'Selamat siang';
        if (hour >= 15 && hour < 18) return 'Selamat sore';
        return 'Selamat malam';
    })();

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

    const handleDeleteNotification = async (id: string) => {
        setDeletingNotificationId(id);
        try {
            await deleteNotificationInboxItem(id);
            await fetchData();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus notifikasi');
        } finally {
            setDeletingNotificationId(null);
        }
    };

    const handleClearNotifications = async () => {
        const confirmed = window.confirm('Kosongkan inbox notifikasi yang belum terkait transaksi?');
        if (!confirmed) return;

        setClearingNotifications(true);
        try {
            await clearNotificationInbox();
            await fetchData();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal mengosongkan inbox notifikasi');
        } finally {
            setClearingNotifications(false);
        }
    };

    const handleToggleRecentTransactions = async () => {
        if (isShowingAllRecent) {
            setIsShowingAllRecent(false);
            return;
        }

        if (allRecentTransactions) {
            setIsShowingAllRecent(true);
            return;
        }

        setLoadingAllRecent(true);
        try {
            const allValidatedTransactions = await fetchTransactions({ validated: true });
            setAllRecentTransactions(allValidatedTransactions);
            setIsShowingAllRecent(true);
        } catch (error) {
            console.error('Error fetching all recent transactions:', error);
            alert('Gagal memuat semua transaksi');
        } finally {
            setLoadingAllRecent(false);
        }
    };

    const displayedRecentTransactions = isShowingAllRecent && allRecentTransactions
        ? allRecentTransactions
        : recentTransactions;

    if (loading) {
        return <Spinner message="Sinkronisasi Data..." />;
    }

    return (
        <div className="p-4 md:p-8 mx-auto w-full max-w-6xl">
            {/* Header */}
            <header className="mb-6 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent italic">
                        NOVA
                    </h1>
                    <p className="text-slate-500 text-sm font-medium truncate">{greeting}, {displayName}</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-white/75 app-surface-muted flex items-center justify-center shrink-0">
                    <span className="text-base font-bold text-blue-600">{displayName.slice(0, 2).toUpperCase()}</span>
                </div>
            </header>

            <section className="app-hero-card rounded-3xl p-4 mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl -mr-16 -mt-16" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.18 }}></div>
                <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full blur-3xl -ml-14 -mb-14" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.12 }}></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Ringkasan Kas</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Dana Likuid</p>
                            <p className="mt-1 text-xs font-bold text-white break-all leading-snug">
                                {displayCurrency(summaryData.liquidBalance)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Pemasukan</p>
                            <p className="mt-1 text-xs font-bold text-emerald-300 break-all leading-snug">
                                +{displayCurrency(summaryData.incomeMonth)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Pengeluaran</p>
                            <p className="mt-1 text-xs font-bold text-rose-300 break-all leading-snug">
                                -{displayCurrency(summaryData.expenseMonth)}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Kekayaan per Individu */}
            {meta.owners.length > 0 && wealthDistribution.length > 0 && (
                <section className="mb-8 relative z-10">
                    <div className="app-section-header rounded-2xl px-4 py-3 flex items-center justify-between gap-3 mb-4">
                        <h3 className="font-bold text-slate-900">Kekayaan per Individu</h3>
                        <button onClick={toggleHideWealth} className="text-slate-400 hover:text-blue-600 transition-colors p-1 flex items-center gap-1.5" title={isWealthHidden ? "Tampilkan Kekayaan" : "Sembunyikan Kekayaan"}>
                            {isWealthHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span className="text-[11px] font-bold uppercase tracking-wider">{isWealthHidden ? 'View' : 'Hide'}</span>
                        </button>
                    </div>
                    {!isWealthHidden && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {wealthDistribution.map((w) => (
                                <div
                                    key={w.id}
                                    onClick={() => setExpandedOwnerId(prev => prev === w.id ? null : w.id)}
                                    className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm cursor-pointer hover:border-blue-300 transition-colors hover:shadow-md"
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20 shrink-0">
                                            {w.name.substring(0, 1)}
                                        </div>
                                        <div className="flex-1 min-w-0 flex justify-between items-center">
                                            <div>
                                                <h4 className="font-bold text-slate-800 leading-tight truncate">{w.name}</h4>
                                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">{w.accountCount} Rekening Aktif</p>
                                            </div>
                                            {expandedOwnerId === w.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Total Saldo</p>
                                        <p className="text-xl font-bold text-slate-900">{displayCurrency(w.total)}</p>
                                    </div>

                                    {expandedOwnerId === w.id ? (
                                        <div className="pt-4 border-t border-slate-100 space-y-3">
                                            {w.accounts.map(acc => (
                                                <div key={acc.id} className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between items-center text-xs gap-2">
                                                        <span className="text-slate-600 font-bold truncate max-w-[140px] sm:max-w-[180px]">{acc.name}</span>
                                                        <span className="text-slate-900 font-bold text-right">{displayCurrency(acc.balance)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-[9px] text-slate-400 uppercase">{acc.type}</p>
                                                        {canLaunchAccountApp(acc) ? (
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleLaunchAccount(acc);
                                                                }}
                                                                className="h-7 px-2.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
                                                            >
                                                                <ExternalLink size={11} />
                                                                {launchingAccountId === acc.id ? 'Buka...' : 'Buka'}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                            {w.accounts.length === 0 && (
                                                <p className="text-xs text-slate-400 italic text-center">Tidak ada rekening terdaftar</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="pt-4 border-t border-slate-100">
                                            <div className="min-w-0">
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter truncate">Dana Likuid</p>
                                                <p className="text-xs font-bold text-slate-700 truncate">{displayCurrency(w.total)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 mb-10">
                {[
                    { label: 'Income', color: 'bg-emerald-50 text-emerald-600', icon: '↘', type: 'INCOME' },
                    { label: 'Expense', color: 'bg-rose-50 text-rose-600', icon: '↗', type: 'EXPENSE' },
                    { label: 'Transfer', color: 'bg-blue-50 text-blue-600', icon: '⇄', type: 'TRANSFER' },
                    { label: 'Investment', color: 'bg-amber-50 text-amber-600', icon: '📈', type: 'INVESTMENT' },
                ].map((item, i) => (
                    <button
                        key={i}
                        onClick={() => openModal(item.type as any)}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ${item.color} flex items-center justify-center text-xl font-bold border border-white shadow-sm group-active:scale-90 transition-transform`}>
                            {item.icon}
                        </div>
                        <span className="app-action-chip rounded-full px-2.5 py-1 text-[10px] text-slate-700 font-bold uppercase tracking-wider">{item.label}</span>
                    </button>
                ))}
            </div>

            <section className="mb-10">
                <div className="app-section-header rounded-2xl px-4 py-3 mb-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="font-bold text-slate-900">Inbox Notifikasi Otomatis</h3>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-1">
                                WhatsApp dan notifikasi bank yang sudah masuk ke backend
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={fetchData}
                                className="app-action-chip rounded-full px-3 py-2 text-xs text-blue-600 font-bold uppercase tracking-wide shrink-0"
                            >
                                Refresh
                            </button>
                            <button
                                onClick={() => void handleClearNotifications()}
                                disabled={clearingNotifications}
                                className="app-action-chip rounded-full px-3 py-2 text-xs text-rose-600 font-bold uppercase tracking-wide shrink-0 disabled:opacity-50"
                            >
                                {clearingNotifications ? 'Menghapus...' : 'Kosongkan Inbox'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    {notifications.length > 0 ? (
                        notifications.map((item) => {
                            const tone = notificationTone(item.parseStatus);
                            return (
                                <div key={item.id} className={`border rounded-2xl p-4 ${tone.shell}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`}></span>
                                                <p className="text-sm font-bold text-slate-900 line-clamp-1">
                                                    {item.title || item.senderName || item.sourceApp}
                                                </p>
                                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide ${tone.badge}`}>
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
                                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide ${item.transaction ? 'bg-blue-100 text-blue-700' : 'bg-white/80 text-slate-500 border border-white'}`}>
                                            {item.transaction ? 'Sudah jadi transaksi' : 'Belum jadi transaksi'}
                                        </span>
                                    </div>

                                    {item.parseNotes ? (
                                        <p className="text-[11px] text-slate-500 mt-3">
                                            {item.parseNotes}
                                        </p>
                                    ) : null}

                                    {!item.transaction ? (
                                        <div className="mt-3 flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleDeleteNotification(item.id)}
                                                disabled={deletingNotificationId === item.id}
                                                className="h-8 px-3 rounded-lg bg-white/80 border border-slate-200 text-[11px] font-bold uppercase tracking-wide text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                                            >
                                                {deletingNotificationId === item.id ? 'Menghapus...' : 'Hapus'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    openModal(
                                                        (item.parsedType as any) || 'EXPENSE',
                                                        {
                                                            amount: item.parsedAmount || undefined,
                                                            description: item.parseNotes || item.messageText,
                                                            type: (item.parsedType as any) || undefined,
                                                            notificationInboxId: item.id
                                                        }
                                                    );
                                                }}
                                                className="h-8 px-3 rounded-lg bg-blue-600 border border-transparent text-[11px] font-bold uppercase tracking-wide text-white hover:bg-blue-700 transition-colors"
                                            >
                                                Buat Transaksi
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    ) : (
                        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5 text-sm text-slate-500">
                            Belum ada notifikasi otomatis yang masuk. Setelah Android helper app aktif, inbox akan muncul di sini.
                        </div>
                    )}
                </div>
            </section>

            {/* Pending Approval Section */}
            {pendingTransactions.length > 0 && (
                <section className="mb-10">
                    <div className="app-section-header rounded-2xl px-4 py-3 flex justify-between items-center mb-6 gap-3">
                        <h3 className="font-bold text-amber-600 flex items-center gap-2">
                            <span>Menunggu Persetujuan</span>
                            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full">{pendingTransactions.length}</span>
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {pendingTransactions.map((tx, i: number) => (
                            <div key={i} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-amber-50/50 border border-amber-200 rounded-2xl shadow-sm shadow-amber-100/50">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-lg text-amber-600">
                                        🔔
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-slate-900 line-clamp-1">{tx.description || tx.activity?.name}</p>
                                        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">
                                            {tx.type} • {formatCurrency(tx.amount)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 sm:ml-2 self-end sm:self-auto">
                                    <button
                                        onClick={() => {
                                            openModal((tx.type as any) || 'EXPENSE', {
                                                amount: tx.amount,
                                                description: tx.description || tx.activity?.name,
                                                type: (tx.type as any) || undefined,
                                                sourceAccountId: tx.sourceAccountId || undefined,
                                                destinationAccountId: tx.destinationAccountId || undefined,
                                                pendingTransactionId: tx.id
                                            });
                                        }}
                                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors border border-emerald-100 font-bold text-lg"
                                        title="Setujui dan Lengkapi"
                                    >
                                        ✓
                                    </button>
                                    <button
                                        onClick={() => handleValidate(tx.id, 'REJECT', tx)}
                                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-colors border border-rose-100 font-bold text-lg"
                                        title="Tolak"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent Transactions */}
            <section>
                <div className="app-section-header rounded-2xl px-4 py-3 flex justify-between items-center mb-6 gap-3">
                    <h3 className="font-bold text-slate-900">Transaksi Terakhir</h3>
                    <button
                        type="button"
                        onClick={() => void handleToggleRecentTransactions()}
                        disabled={loadingAllRecent}
                        className="app-action-chip rounded-full px-3 py-2 text-xs text-blue-600 font-bold uppercase tracking-wide shrink-0 disabled:opacity-50"
                    >
                        {loadingAllRecent ? 'Memuat...' : isShowingAllRecent ? 'Ringkas' : 'Lihat Semua'}
                    </button>
                </div>
                <div className="space-y-3">
                    {displayedRecentTransactions.length > 0 ? (
                        displayedRecentTransactions.map((tx, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-3 p-4 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50/50 transition-colors shadow-sm shadow-slate-100">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-600' :
                                        tx.type === 'EXPENSE' ? 'bg-rose-50 text-rose-600' :
                                            tx.type === 'TRANSFER' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                                        }`}>
                                        {tx.type === 'INCOME' ? '↘' : tx.type === 'EXPENSE' ? '↗' : '⇄'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-slate-900 line-clamp-1">{tx.description || tx.activity?.name}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                            {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-500 font-medium line-clamp-1">
                                            {getRecentTransactionAccountInfo(tx)}
                                        </p>
                                    </div>
                                </div>
                                <p className={`font-bold text-sm ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                    {tx.type === 'EXPENSE' ? '-' : ''}{formatCurrency(tx.amount)}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-slate-400 text-sm py-10 italic">Belum ada transaksi</p>
                    )}
                </div>
            </section>
        </div>
    );
};

export default Home;
