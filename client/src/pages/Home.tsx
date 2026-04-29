import { useEffect, useRef, useState } from 'react';
import { useTransaction } from '../context/TransactionContext';
import {
    clearNotificationInbox,
    deleteNotificationInboxItem,
    fetchNotificationInbox,
    type NotificationItem
} from '../services/notificationInbox';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import { buildAccountUsageFrequency, sortAccountsByUsage } from '../services/accountUsage';
import { fetchTransactions, type TransactionItem, validateTransaction } from '../services/transactions';
import { Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink, Bell } from 'lucide-react';
import { subscribeTableChanges } from '../services/realtime';
import { canLaunchAccountApp, launchAccountApp } from '../services/accountLauncher';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import NotificationDrawer from '../components/NotificationDrawer';
import { useNavigate } from 'react-router-dom';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const extractAccountNumberCandidates = (value: string) => {
    const matches = value.match(/(?:\*{0,4}\d[\d*-]{3,}|\d{10,18})/g) ?? [];
    return Array.from(new Set(matches
        .map((item) => digitsOnly(item))
        .filter((item) => item.length >= 4)
        .sort((a, b) => b.length - a.length)));
};

const Home = () => {
    const { openModal } = useTransaction();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [meta, setMeta] = useState<{ owners: Owner[]; accounts: Account[] }>({ owners: [], accounts: [] });
    const [summaryData, setSummaryData] = useState({
        liquidBalance: 0,
        incomeMonth: 0,
        expenseMonth: 0,
        investmentValue: 0
    });
    const [validatedTransactions, setValidatedTransactions] = useState<TransactionItem[]>([]);
    const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
    const [pendingTransactions, setPendingTransactions] = useState<TransactionItem[]>([]);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const isBalanceHidden = localStorage.getItem('hideBalance') === 'true';
    const [isWealthHidden, setIsWealthHidden] = useState(() => localStorage.getItem('hideWealth') === 'true');
    const [isMemberFundsOpen, setIsMemberFundsOpen] = useState(() => localStorage.getItem('showMemberFunds') === 'true');
    const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
    const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
    const [clearingNotifications, setClearingNotifications] = useState(false);
    const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<TransactionItem | null>(null);
    const refreshTimeoutRef = useRef<number | null>(null);

    const findAccountByNumberHint = (message: string) => {
        const candidates = extractAccountNumberCandidates(message);
        if (candidates.length === 0) return undefined;

        return meta.accounts.find((account) => {
            const accountDigits = digitsOnly(account.accountNumber || '');
            return candidates.some((candidate) =>
                accountDigits === candidate
                || accountDigits.endsWith(candidate)
                || candidate.endsWith(accountDigits)
            );
        });
    };

    const findAccountBySourceApp = (sourceApp: string) => {
        const lower = sourceApp.toLowerCase();
        return meta.accounts.find((account) =>
            account.name.toLowerCase().includes(lower)
            || (account.appPackageName ?? '').toLowerCase().includes(lower)
        );
    };

    const buildNotificationPrefill = (item: NotificationItem) => {
        const combinedText = `${item.title || ''} ${item.messageText || ''} ${item.parsedAccountHint || ''}`;
        const matchedByNumber = findAccountByNumberHint(combinedText);
        const matchedBySource = findAccountBySourceApp(item.sourceApp);

        let sourceAccountId: string | undefined;
        let destinationAccountId: string | undefined;

        if (item.parsedType === 'INCOME') {
            destinationAccountId = matchedByNumber?.id || matchedBySource?.id;
        } else if (item.parsedType === 'EXPENSE' || item.parsedType === 'INVESTMENT_OUT') {
            sourceAccountId = matchedBySource?.id || matchedByNumber?.id;
        } else if (item.parsedType === 'TRANSFER' || item.parsedType === 'TOP_UP') {
            sourceAccountId = matchedBySource?.id;
            destinationAccountId = matchedByNumber?.id;

            if (!sourceAccountId && matchedByNumber?.id) {
                sourceAccountId = matchedByNumber.id;
                destinationAccountId = undefined;
            }
            if (sourceAccountId && destinationAccountId && sourceAccountId === destinationAccountId) {
                destinationAccountId = undefined;
            }
        }

        const ownerId = meta.accounts.find((account) =>
            account.id === sourceAccountId || account.id === destinationAccountId
        )?.ownerId;

        return {
            ownerId: ownerId || undefined,
            sourceAccountId,
            destinationAccountId
        };
    };

    const toggleHideWealth = () => {
        setIsWealthHidden(prev => {
            const val = !prev;
            localStorage.setItem('hideWealth', String(val));
            return val;
        });
    };

    const toggleMemberFunds = () => {
        setIsMemberFundsOpen(prev => {
            const next = !prev;
            localStorage.setItem('showMemberFunds', String(next));
            if (!next) {
                setExpandedOwnerId(null);
            }
            return next;
        });
    };

    const [accountFreq, setAccountFreq] = useState<Record<string, number>>({});

    const fetchData = async () => {
        try {
            const [
                recentResult,
                validatedResult,
                pendingResult,
                metaResult,
                notificationsResult
            ] = await Promise.allSettled([
                fetchTransactions({ validated: true, limit: 20 }),
                fetchTransactions({ validated: true }),
                fetchTransactions({ validated: false, limit: 20 }),
                fetchMasterMeta(),
                fetchNotificationInbox(8)
            ]);
            const nextMeta = metaResult.status === 'fulfilled' ? metaResult.value : { owners: [], accounts: [], activities: [] };
            const nextNotifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value : [];
            const isInvestmentAccount = (accountType?: string) => accountType === 'RDN' || accountType === 'Sekuritas';
            const isInvestmentIncome = (tx: TransactionItem) => tx.type === 'INCOME' && isInvestmentAccount(tx.destinationAccount?.type);

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const isCurrentMonth = (value: string) => {
                const txDate = new Date(value);
                return txDate >= startOfMonth && txDate < endOfMonth;
            };

            const nextRecentTransactions = (recentResult.status === 'fulfilled' ? recentResult.value : []).filter((tx: any) => isCurrentMonth(tx.date));
            const allValidatedTransactions = validatedResult.status === 'fulfilled' ? validatedResult.value : [];
            const nextPendingTransactions = pendingResult.status === 'fulfilled' ? pendingResult.value : [];

            const liquidBalance = nextMeta.accounts
                .filter((acc: Account) => acc.type === 'Bank' || acc.type === 'E-Wallet')
                .reduce((sum: number, acc: Account) => sum + acc.balance, 0);

            // Hitung frekuensi penggunaan rekening dari semua transaksi yang berhasil dimuat
            const freq = buildAccountUsageFrequency(allValidatedTransactions);

            const incomeMonth = allValidatedTransactions
                .filter((tx: any) => tx.type === 'INCOME' && !isInvestmentIncome(tx) && isCurrentMonth(tx.date))
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const expenseMonth = allValidatedTransactions
                .filter((tx: any) => tx.type === 'EXPENSE' && isCurrentMonth(tx.date))
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const investmentValue = nextMeta.accounts
                .filter((acc: Account) => acc.type === 'RDN' || acc.type === 'Sekuritas')
                .reduce((sum: number, acc: Account) => sum + Math.abs(acc.balance), 0);

            setSummaryData({ liquidBalance, incomeMonth, expenseMonth, investmentValue });
            setAccountFreq(freq);
            setValidatedTransactions(allValidatedTransactions);
            setRecentTransactions(nextRecentTransactions);
            setPendingTransactions(nextPendingTransactions);
            setNotifications(nextNotifications);
            setMeta({ owners: nextMeta.owners, accounts: nextMeta.accounts });
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
        const handleDataChanged = () => {
            scheduleRefresh();
        };
        window.addEventListener('nova:data-changed', handleDataChanged);

        return () => {
            unsubscribeNotifications();
            unsubscribeTransactions();
            window.removeEventListener('nova:data-changed', handleDataChanged);
            if (refreshTimeoutRef.current) {
                window.clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []);

    const handleValidate = async (id: string, action: 'APPROVE' | 'REJECT', tx: any) => {
        if (action === 'REJECT') {
            const confirmed = window.confirm('Apakah Anda yakin ingin menolak dan menghapus transaksi pending ini?');
            if (!confirmed) return;
        }

        setLoading(true);
        try {
            // For MVP, we send back the same data, but user could ideally edit it in a modal
            await validateTransaction(id, {
                action,
                sourceAccountId: tx.sourceAccountId,
                destinationAccountId: tx.destinationAccountId,
                categoryId: tx.activityId,
                amount: tx.amount,
                type: tx.type
            });

            // Optimistic Update: Remove from local state immediately
            setPendingTransactions(prev => prev.filter(t => t.id !== id));
            // After any action (APPROVE or REJECT), hide the notification from the drawer immediately
            setNotifications(prev => prev.filter(n => n.transaction?.id !== id));
            if (action === 'REJECT') {
                alert('Transaksi berhasil ditolak dan dihapus dari daftar.');
            }

            await fetchData(); // Refresh all other data
        } catch (error: any) {
            console.error('Error validating transaction:', error);
            const msg = error.response?.data?.error || error.message || 'Error tidak diketahui';
            alert(`Gagal memproses transaksi: ${msg}\n\nPastikan Anda sudah memuat ulang (Refresh) aplikasi versi terbaru.`);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value).replace('Rp', 'Rp ');
    };

    const displayCurrency = (value: number) => {
        return isBalanceHidden ? 'Rp •••••••' : formatCurrency(value);
    };

    const isInvestmentAccountType = (type?: string) => {
        const normalizedType = type?.toLowerCase();
        return normalizedType === 'rdn' || normalizedType === 'sekuritas';
    };

    const isInvestmentTransfer = (tx: TransactionItem) => {
        return tx.type === 'TRANSFER' && isInvestmentAccountType(tx.destinationAccount?.type);
    };

    const isTopUpTransaction = (tx: TransactionItem) => {
        const description = `${tx.description || ''} ${tx.activity?.name || ''}`.toLowerCase();
        const destinationType = tx.destinationAccount?.type?.toLowerCase();
        return !isInvestmentTransfer(tx) && (tx.type === 'TOP_UP' || tx.type === 'TRANSFER') && (
            description.includes('top up')
            || description.includes('topup')
            || destinationType === 'e-wallet'
        );
    };

    const getRecentTransactionTitle = (tx: TransactionItem) => {
        if (isInvestmentTransfer(tx) || tx.type === 'INVESTMENT_OUT') return 'Investasi';
        return tx.description || tx.activity?.name || 'Detail Transaksi';
    };

    const getRecentTransactionVisual = (tx: TransactionItem) => {
        if (isInvestmentTransfer(tx) || tx.type === 'INVESTMENT_OUT') {
            return {
                iconWrap: 'bg-amber-50 text-amber-600',
                icon: '↗',
                amountClass: 'text-slate-800',
                amountPrefix: '',
                badge: 'Investasi'
            };
        }

        if (isTopUpTransaction(tx)) {
            return {
                iconWrap: 'bg-rose-50 text-rose-600',
                icon: '↗',
                amountClass: 'text-slate-800',
                amountPrefix: '-',
                badge: 'Top Up'
            };
        }

        if (tx.type === 'INCOME') {
            return {
                iconWrap: 'bg-emerald-50 text-emerald-600',
                icon: '↘',
                amountClass: 'text-emerald-500',
                amountPrefix: '',
                badge: 'Masuk'
            };
        }

        if (tx.type === 'EXPENSE') {
            return {
                iconWrap: 'bg-rose-50 text-rose-600',
                icon: '↗',
                amountClass: 'text-slate-800',
                amountPrefix: '-',
                badge: 'Keluar'
            };
        }

        if (tx.type === 'TOP_UP') {
            return {
                iconWrap: 'bg-fuchsia-50 text-fuchsia-600',
                icon: '⬆',
                amountClass: 'text-fuchsia-600',
                amountPrefix: '-',
                badge: 'Top Up'
            };
        }

        if (tx.type === 'TRANSFER') {
            return {
                iconWrap: 'bg-blue-50 text-blue-600',
                icon: '⇄',
                amountClass: 'text-slate-800',
                amountPrefix: '',
                badge: 'Transfer'
            };
        }

        return {
            iconWrap: 'bg-amber-50 text-amber-600',
            icon: '⇄',
            amountClass: 'text-slate-800',
            amountPrefix: '',
            badge: 'Investasi'
        };
    };



    const getRecentTransactionAccountInfo = (tx: TransactionItem) => {
        const source = tx.sourceAccount?.name;
        const destination = tx.destinationAccount?.name;

        if ((tx.type === 'TRANSFER' || tx.type === 'TOP_UP') && source && destination) {
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

    const trackedAccounts = meta.accounts.filter((account) =>
        ['Bank', 'E-Wallet', 'RDN', 'Sekuritas'].includes(account.type)
    );

    const wealthDistribution = meta.owners.map(owner => {
        const ownedAccounts = trackedAccounts
            .map((account) => {
                let amount = 0;

                validatedTransactions.forEach((tx) => {
                    if (tx.ownerId !== owner.id) return;

                    if ((tx.type === 'INCOME') && tx.destinationAccountId === account.id) {
                        amount += tx.amount;
                    }

                    if ((tx.type === 'EXPENSE') && tx.sourceAccountId === account.id) {
                        amount -= tx.amount;
                    }

                    if (tx.type === 'TRANSFER' || tx.type === 'TOP_UP' || tx.type === 'INVESTMENT_IN' || tx.type === 'INVESTMENT_OUT') {
                        if (tx.destinationAccountId === account.id) amount += tx.amount;
                        if (tx.sourceAccountId === account.id) amount -= tx.amount;
                    }
                });

                return {
                    ...account,
                    balance: amount
                };
            })
            .filter((account) => account.balance !== 0);
        const ownerAccounts = sortAccountsByUsage(
            ownedAccounts,
            accountFreq
        );

        const total = ownerAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        return { ...owner, total, accountCount: ownerAccounts.length, accounts: ownerAccounts };
    }).sort((a, b) => b.total - a.total);

    const totalMemberFunds = wealthDistribution.reduce((sum, owner) => sum + owner.total, 0);
    const needsInitialSetup = meta.owners.length === 0 && meta.accounts.length === 0 && validatedTransactions.length === 0;



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
        try {
            const result = await launchAccountApp(account);
            if (!result.ok && result.message) {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
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
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsNotificationDrawerOpen(true)}
                        className="relative w-11 h-11 rounded-full flex items-center justify-center bg-white/75 hover:bg-white text-slate-600 transition-colors shadow-sm"
                    >
                        <Bell size={20} />
                        {notifications.filter(n => !n.transaction).length > 0 && (
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                        )}
                    </button>
                    <div className="w-14 h-14 rounded-full bg-white/75 app-surface-muted flex items-center justify-center shrink-0">
                        <span className="text-base font-bold text-blue-600">{displayName.slice(0, 2).toUpperCase()}</span>
                    </div>
                </div>
            </header>

            <section className="app-hero-card rounded-[32px] p-5 mb-8 relative overflow-hidden shadow-xl shadow-blue-900/5 border border-white/20">
                <div className="absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-20 -mt-20" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.25 }}></div>
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.15 }}></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Ringkasan Kas Utama</p>
                        <button onClick={toggleHideWealth} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/25 transition-colors backdrop-blur-md" title={isWealthHidden ? "Tampilkan Saldo" : "Sembunyikan Saldo"}>
                            {isWealthHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                    
                    <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-sm mb-5">
                        {displayCurrency(summaryData.liquidBalance)}
                    </h2>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-4 h-4 rounded-full bg-emerald-400/20 flex items-center justify-center"><span className="text-[8px] text-emerald-300">↘</span></div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Pemasukan</p>
                            </div>
                            <p className="text-sm font-bold text-emerald-300 truncate">+{displayCurrency(summaryData.incomeMonth)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-4 h-4 rounded-full bg-rose-400/20 flex items-center justify-center"><span className="text-[8px] text-rose-300">↗</span></div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Pengeluaran</p>
                            </div>
                            <p className="text-sm font-bold text-rose-300 truncate">-{displayCurrency(summaryData.expenseMonth)}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Total Kekayaan Tercatat */}
            {!isWealthHidden && (
                <section className="mb-6">
                    <div className="flex items-center justify-between gap-3 rounded-[24px] bg-white px-5 py-4 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] border border-slate-100">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Kekayaan Tercatat</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                                {formatCurrency(summaryData.liquidBalance + summaryData.investmentValue)}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kas</span>
                            <span className="text-xs font-bold text-slate-700">{formatCurrency(summaryData.liquidBalance)}</span>
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-1">Investasi</span>
                            <span className="text-xs font-bold text-emerald-600">{formatCurrency(summaryData.investmentValue)}</span>
                        </div>
                    </div>
                </section>
            )}

            {/* Kekayaan per Individu */}
            {meta.owners.length > 0 && wealthDistribution.length > 0 && !isWealthHidden && (
                <section className="mb-8 relative z-10">
                    <button
                        type="button"
                        onClick={toggleMemberFunds}
                        className="mb-4 flex w-full items-center justify-between gap-3 rounded-[24px] bg-white px-4 py-4 text-left shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] border border-slate-100"
                    >
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm">Dana Anggota</h3>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                {meta.owners.length} terdaftar • {displayCurrency(totalMemberFunds)}
                            </p>
                        </div>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                            {isMemberFundsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                    </button>

                    {isMemberFundsOpen && (
                        <div className="flex flex-col gap-3">
                            {wealthDistribution.map((w) => (
                                <div
                                    key={w.id}
                                    className="bg-white border border-slate-100 rounded-[24px] p-4 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)]"
                                >
                                    <div
                                        className="flex items-center justify-between gap-3 cursor-pointer group"
                                        onClick={() => setExpandedOwnerId(prev => prev === w.id ? null : w.id)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 font-bold shrink-0 group-hover:bg-slate-100 transition-colors">
                                                {w.name.substring(0, 1)}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-slate-800 text-sm truncate">{w.name}</h4>
                                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">{w.accountCount} Rekening • {displayCurrency(w.total)}</p>
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 shrink-0">
                                            {expandedOwnerId === w.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>

                                    {expandedOwnerId === w.id && (
                                        <div className="mt-4 pt-4 border-t border-slate-50 space-y-2.5">
                                            {w.accounts.map(acc => (
                                                <div key={acc.id} className="flex justify-between items-center gap-2 group/acc">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs text-slate-600 font-bold truncate">{acc.name}</p>
                                                        <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">{acc.type}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className="text-xs text-slate-900 font-bold">{displayCurrency(acc.balance)}</span>
                                                        {canLaunchAccountApp(acc) && (
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleLaunchAccount(acc);
                                                                }}
                                                                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
                                                                title="Buka Aplikasi"
                                                            >
                                                                <ExternalLink size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {w.accounts.length === 0 && (
                                                <p className="text-[11px] text-slate-400 italic text-center py-2">Belum ada dana/rekening</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Quick Actions */}
            <div className="mb-10 grid grid-cols-4 gap-2 rounded-[28px] border border-slate-100 bg-white p-3 sm:p-4 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)]">
                {[
                    { label: 'Income', color: 'bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600', icon: '↘', type: 'INCOME' },
                    { label: 'Expense', color: 'bg-gradient-to-br from-rose-100 to-rose-50 text-rose-600', icon: '↗', type: 'EXPENSE' },
                    { label: 'Transfer', color: 'bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600', icon: '⇄', type: 'TRANSFER' },
                    { label: 'Invest', color: 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600', icon: '📈', type: 'INVESTMENT' },
                ].map((item, i) => (
                    <button
                        key={i}
                        onClick={() => openModal(item.type as any)}
                        className="group flex min-w-0 flex-col items-center gap-2 focus:outline-none"
                    >
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ${item.color} flex items-center justify-center text-xl font-bold border border-white shadow-[0_4px_12px_-6px_rgba(0,0,0,0.1)] group-active:scale-90 transition-transform`}>
                            {item.icon}
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-slate-600 font-bold uppercase tracking-widest">{item.label}</span>
                    </button>
                ))}
            </div>

            {needsInitialSetup && (
                <section className="mb-10 rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5 shadow-[0_8px_24px_-14px_rgba(37,99,235,0.18)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-blue-600">Mulai Setup</p>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">Akun baru Anda sudah siap dipakai.</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        Tambahkan anggota, kategori, dan rekening dulu supaya input transaksi tidak berakhir di halaman kosong.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/menu?setup=1')}
                        className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-700"
                    >
                        Buka Setup Awal
                    </button>
                </section>
            )}

            {/* Inbox Notifikasi Otomatis Dipindahkan ke NotificationDrawer */}

            {/* Pending Approval Section */}
            {pendingTransactions.length > 0 && (
                <section className="mb-10">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h3 className="font-bold text-amber-600 text-sm flex items-center gap-2">
                            Menunggu Persetujuan
                            <span className="bg-amber-100 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-bold">{pendingTransactions.length}</span>
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {pendingTransactions.map((tx) => (
                            <div key={tx.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50/30 border border-amber-200/60 rounded-[20px] shadow-sm shadow-amber-100/50">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-amber-100/80 flex items-center justify-center text-lg text-amber-600 shrink-0">
                                        🔔
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-slate-900 truncate">{getRecentTransactionTitle(tx)}</p>
                                        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest mt-0.5">
                                            {tx.type} • {formatCurrency(tx.amount)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 sm:ml-2 self-end sm:self-auto shrink-0">
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
                                        className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all border border-emerald-100 font-bold text-lg focus:outline-none"
                                        title="Setujui dan Lengkapi"
                                    >
                                        ✓
                                    </button>
                                    <button
                                        onClick={() => handleValidate(tx.id, 'REJECT', tx)}
                                        className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-all border border-rose-100 font-bold text-lg focus:outline-none"
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
                <div className="flex justify-between items-center mb-4 px-1 gap-3">
                    <h3 className="font-bold text-slate-900 text-sm">Transaksi Terakhir</h3>
                    <button
                        type="button"
                        onClick={() => navigate('/reports')}
                        className="text-[10px] text-blue-600 font-bold uppercase tracking-widest hover:text-blue-700 transition-colors"
                    >
                        LIHAT SEMUA
                    </button>
                </div>
                <div className="space-y-2.5">
                    {recentTransactions.length > 0 ? (
                        recentTransactions.map((tx) => {
                            const visual = getRecentTransactionVisual(tx);
                            return (
                                <button
                                    key={tx.id}
                                    type="button"
                                    onClick={() => setSelectedTransaction(tx)}
                                    className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-slate-100/60 bg-white p-4 text-left shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] transition-colors hover:bg-slate-50/50"
                                >
                                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${visual.iconWrap}`}>
                                            {visual.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="mb-0.5 truncate text-sm font-bold text-slate-800">{getRecentTransactionTitle(tx)}</p>
                                            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                <span>{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                                                <span>•</span>
                                                <span className="truncate">{getRecentTransactionAccountInfo(tx)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end">
                                        <span className="mb-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                            {visual.badge}
                                        </span>
                                        <p className={`ml-1 shrink-0 text-sm font-bold ${visual.amountClass}`}>
                                            {visual.amountPrefix}{formatCurrency(tx.amount)}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 px-4 bg-white/50 border border-dashed border-slate-200 rounded-[24px]">
                            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest text-center">Belum ada transaksi</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Drawer Notifikasi */}
            <NotificationDrawer
                isOpen={isNotificationDrawerOpen}
                onClose={() => setIsNotificationDrawerOpen(false)}
                notifications={notifications}
                accounts={meta.accounts}
                onClearAll={handleClearNotifications}
                onDelete={handleDeleteNotification}
                onRejectTransaction={async (txId) => {
                    await handleValidate(txId, 'REJECT', {});
                }}
                onMakeTransaction={(item, overrideAmount) => {
                    setIsNotificationDrawerOpen(false); // Tutup drawer dulu
                    const prefill = buildNotificationPrefill(item);

                    openModal(
                        (item.parsedType as any) || 'EXPENSE',
                        {
                            amount: overrideAmount ?? item.parsedAmount ?? undefined,
                            description: item.messageText?.slice(0, 100) || item.parseNotes || undefined,
                            type: (item.parsedType as any) || undefined,
                            notificationInboxId: item.id,
                            ownerId: prefill.ownerId,
                            sourceAccountId: prefill.sourceAccountId,
                            destinationAccountId: prefill.destinationAccountId
                        }
                    );
                }}
                clearingNotifications={clearingNotifications}
                deletingNotificationId={deletingNotificationId}
            />

            {selectedTransaction && (
                <div
                    className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
                    onClick={() => setSelectedTransaction(null)}
                >
                    <div
                        className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                    {getRecentTransactionVisual(selectedTransaction).badge}
                                </p>
                                <h3 className="mt-2 text-lg font-bold text-slate-900">
                                    {getRecentTransactionTitle(selectedTransaction)}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTransaction(null)}
                                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100"
                                aria-label="Tutup detail transaksi"
                            >
                                <ChevronDown size={18} />
                            </button>
                        </div>

                        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Nominal</p>
                            <p className="mt-2 text-2xl font-black text-slate-900">
                                {getRecentTransactionVisual(selectedTransaction).amountPrefix}{formatCurrency(selectedTransaction.amount)}
                            </p>
                        </div>

                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                            <div className="flex items-start justify-between gap-4">
                                <span className="font-bold text-slate-400">Waktu</span>
                                <span className="text-right font-semibold text-slate-700">
                                    {new Date(selectedTransaction.date).toLocaleString('id-ID', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <span className="font-bold text-slate-400">Pemilik</span>
                                <span className="text-right font-semibold text-slate-700">{selectedTransaction.owner?.name || '-'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <span className="font-bold text-slate-400">Sumber</span>
                                <span className="text-right font-semibold text-slate-700">{selectedTransaction.sourceAccount?.name || '-'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <span className="font-bold text-slate-400">Tujuan</span>
                                <span className="text-right font-semibold text-slate-700">{selectedTransaction.destinationAccount?.name || '-'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4">
                                <span className="font-bold text-slate-400">Jenis</span>
                                <span className="text-right font-semibold text-slate-700">{selectedTransaction.type}</span>
                            </div>
                        </div>

                        {selectedTransaction.description && (
                            <div className="mt-4 rounded-2xl border border-slate-100 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Catatan</p>
                                <p className="mt-2 text-sm leading-6 text-slate-700">{selectedTransaction.description}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
