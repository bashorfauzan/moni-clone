import { useState, useEffect, useRef } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, Tooltip as ChartTooltip, AreaChart, Area
} from 'recharts';
import { ChevronLeft, ChevronRight, Download, Pencil, Trash2 } from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import { createTransaction, fetchTransactions, type TransactionItem, bulkDeleteTransactions } from '../services/transactions';
import api from '../services/api';
import { fetchMasterMeta } from '../services/masterData';
import { useSecurity } from '../context/SecurityContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import { downloadBackupBlob } from '../services/backup';
import {
    isInvestmentLiquidation,
    isInvestmentTransfer,
    isTopUpLikeTransfer,
    normalizeTransactionType
} from '../lib/transactionRules';

const COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'];
type TransactionModalType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'TOP_UP' | 'INVESTMENT';

const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getReportTransactionKind = (tx: TransactionItem) => {
    if (isInvestmentTransfer(tx)) return 'INVESTMENT_TOP_UP';
    if (isInvestmentLiquidation(tx)) return 'INVESTMENT_LIQUIDATION';
    if (isTopUpLikeTransfer(tx)) return 'TOP_UP';
    return normalizeTransactionType(tx.type) || tx.type;
};

const getWealthDelta = (tx: TransactionItem) => {
    const kind = getReportTransactionKind(tx);
    if (kind === 'INCOME') return tx.amount;
    if (kind === 'EXPENSE') return -tx.amount;
    return 0;
};

const getLiquidCashDelta = (tx: TransactionItem) => {
    const kind = getReportTransactionKind(tx);
    if (kind === 'INCOME' || kind === 'INVESTMENT_LIQUIDATION') return tx.amount;
    if (kind === 'EXPENSE' || kind === 'INVESTMENT_TOP_UP') return -tx.amount;
    return 0;
};

const getPeriodBounds = (currentDate: Date, viewMode: 'MONTHLY' | 'YEARLY') => {
    const today = new Date();
    const periodStart = viewMode === 'MONTHLY'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        : new Date(currentDate.getFullYear(), 0, 1);
    const periodEnd = viewMode === 'MONTHLY'
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        : new Date(currentDate.getFullYear(), 11, 31);
    const cappedEnd = periodEnd > today ? today : periodEnd;
    return { periodStart, cappedEnd };
};

const estimateEndingBalanceForPeriod = ({
    transactions,
    currentBalance,
    currentDate,
    viewMode,
    getDelta,
}: {
    transactions: TransactionItem[];
    currentBalance: number;
    currentDate: Date;
    viewMode: 'MONTHLY' | 'YEARLY';
    getDelta: (tx: TransactionItem) => number;
}) => {
    const { periodStart, cappedEnd } = getPeriodBounds(currentDate, viewMode);
    const deltaByDate = new Map<string, number>();

    transactions.forEach((tx) => {
        const delta = getDelta(tx);
        if (!delta) return;
        const key = toDateKey(new Date(tx.date));
        deltaByDate.set(key, (deltaByDate.get(key) || 0) + delta);
    });

    let reverseBalance = currentBalance;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (cursor >= periodStart) {
        if (toDateKey(cursor) === toDateKey(cappedEnd)) {
            return reverseBalance;
        }
        reverseBalance -= deltaByDate.get(toDateKey(cursor)) || 0;
        cursor.setDate(cursor.getDate() - 1);
    }

    return 0;
};

const buildWealthHistoryData = ({
    transactions,
    totalWealth,
    currentDate,
    viewMode
}: {
    transactions: TransactionItem[];
    totalWealth: number;
    currentDate: Date;
    viewMode: 'MONTHLY' | 'YEARLY';
}) => {
    const { periodStart, cappedEnd } = getPeriodBounds(currentDate, viewMode);
    const today = new Date();

    const deltaByDate = new Map<string, number>();
    transactions.forEach((tx) => {
        const delta = getWealthDelta(tx);
        if (!delta) return;
        const key = toDateKey(new Date(tx.date));
        deltaByDate.set(key, (deltaByDate.get(key) || 0) + delta);
    });

    const dailySnapshot = new Map<string, number>();
    let reverseWealth = totalWealth;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    while (cursor >= periodStart) {
        const key = toDateKey(cursor);
        if (cursor <= cappedEnd) {
            dailySnapshot.set(key, reverseWealth);
        }
        reverseWealth -= deltaByDate.get(key) || 0;
        cursor.setDate(cursor.getDate() - 1);
    }

    if (viewMode === 'MONTHLY') {
        const rows: Array<{ label: string; wealth: number }> = [];
        const dayCursor = new Date(periodStart);
        while (dayCursor <= cappedEnd) {
            const key = toDateKey(dayCursor);
            rows.push({
                label: dayCursor.getDate().toString(),
                wealth: dailySnapshot.get(key) ?? 0
            });
            dayCursor.setDate(dayCursor.getDate() + 1);
        }
        return rows;
    }

    const rows: Array<{ label: string; wealth: number }> = [];
    const monthCursor = new Date(periodStart.getFullYear(), 0, 1);
    while (monthCursor <= cappedEnd) {
        const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
        const snapshotDate = monthEnd > cappedEnd ? cappedEnd : monthEnd;
        rows.push({
            label: snapshotDate.toLocaleDateString('id-ID', { month: 'short' }),
            wealth: dailySnapshot.get(toDateKey(snapshotDate)) ?? 0
        });
        monthCursor.setMonth(monthCursor.getMonth() + 1);
    }
    return rows;
};

const Reports = () => {
    const { openEditModal } = useTransaction();
    const { verifySecurity } = useSecurity();
    const [viewMode, setViewMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [txPage, setTxPage] = useState(1);
    const TX_PER_PAGE = 10;
    const [data, setData] = useState<any>({
        totalIncome: 0,
        totalExpense: 0,
        totalVolume: 0,
        totalWealth: 0,
        zakatAmount: 0,
        snapshotData: {
            investmentTopUp: 0,
            investmentLiquidation: 0,
            endingLiquidCash: 0,
            netCashFlow: 0
        },
        categoryData: [],
        trendData: [],
        wealthHistoryData: [],
        transactionsData: [],
    });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [restoringDelete, setRestoringDelete] = useState(false);
    const [selectedTx, setSelectedTx] = useState<Set<string>>(new Set());
    const [lastDeletedTransactions, setLastDeletedTransactions] = useState<TransactionItem[]>([]);
    const longPressTimerRef = useRef<number | null>(null);
    const longPressTriggeredRef = useRef(false);

    const toggleSelectTx = (id: string) => {
        const next = new Set(selectedTx);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTx(next);
    };

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const startLongPressSelection = (id: string) => {
        clearLongPressTimer();
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTriggeredRef.current = true;
            setSelectedTx((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
        }, 450);
    };

    const cancelLongPressSelection = () => {
        clearLongPressTimer();
    };

    const handleTransactionPress = (tx: TransactionItem) => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }

        if (selectedTx.size > 0) {
            toggleSelectTx(tx.id);
            return;
        }

        openEditModal(tx.id, getEditableModalType(tx), {
            amount: tx.amount,
            description: tx.description || tx.activity?.name,
            ownerId: tx.ownerId,
            activityId: tx.activityId,
            sourceAccountId: tx.sourceAccountId,
            destinationAccountId: tx.destinationAccountId
        });
    };

    const handleBulkDelete = async () => {
        if (selectedTx.size === 0) return;
        const authorized = await verifySecurity(`Hapus ${selectedTx.size} Transaksi`);
        if (!authorized) return;

        try {
            const deletedSnapshot = data.transactionsData.filter((tx: TransactionItem) => selectedTx.has(tx.id));
            await bulkDeleteTransactions(Array.from(selectedTx));
            setLastDeletedTransactions(deletedSnapshot);
            setSelectedTx(new Set());
            await fetchReportData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal menghapus transaksi terpilih'));
        }
    };

    const handleUndoLastDelete = async () => {
        if (lastDeletedTransactions.length === 0 || restoringDelete) return;

        setRestoringDelete(true);
        try {
            const sortedTransactions = [...lastDeletedTransactions].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            for (const tx of sortedTransactions) {
                const restoredType = normalizeTransactionType(tx.type) || 'INCOME';
                await createTransaction({
                    amount: tx.amount,
                    description: tx.description || tx.activity?.name,
                    ownerId: tx.ownerId || '',
                    type: restoredType,
                    sourceAccountId: tx.sourceAccountId,
                    destinationAccountId: tx.destinationAccountId,
                    activityId: tx.activityId,
                    date: tx.date
                });
            }

            setLastDeletedTransactions([]);
            await fetchReportData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal membatalkan hapus transaksi terakhir'));
        } finally {
            setRestoringDelete(false);
        }
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get('/master/export-excel', { responseType: 'blob' });
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            downloadBackupBlob(blob, `Catatan Keuangan Pribadi ${dateStr}.xlsx`);
        } catch (error: any) {
            try {
                const XLSX = await import('xlsx');
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
                const workbook = XLSX.utils.book_new();

                const summaryRows = [
                    { Metrik: 'Periode', Nilai: periodLabel },
                    { Metrik: 'Pemasukan', Nilai: data.totalIncome },
                    { Metrik: 'Pengeluaran', Nilai: data.totalExpense },
                    { Metrik: 'Transfer ke Investasi', Nilai: data.snapshotData?.investmentTopUp || 0 },
                    { Metrik: 'Pencairan Investasi', Nilai: data.snapshotData?.investmentLiquidation || 0 },
                    { Metrik: 'Sisa Kas Akhir Periode', Nilai: data.snapshotData?.endingLiquidCash || 0 },
                    { Metrik: 'Arus Kas Bersih', Nilai: data.snapshotData?.netCashFlow || 0 },
                    { Metrik: 'Perputaran', Nilai: data.totalVolume },
                    { Metrik: 'Total Kekayaan', Nilai: data.totalWealth },
                    { Metrik: 'Estimasi Zakat', Nilai: data.zakatAmount }
                ];

                const wealthRows = (data.wealthHistoryData || []).map((row: any) => ({
                    Periode: row.label,
                    'Kekayaan Tercatat': row.wealth
                }));

                const categoryRows = (data.categoryData || []).map((row: any) => ({
                    Kategori: row.name,
                    Nilai: row.value
                }));

                const trendRows = (data.trendData || []).map((row: any) => ({
                    Label: row.label,
                    Pemasukan: row.Pemasukan,
                    Pengeluaran: row.Pengeluaran
                }));

                const transactionRows = (data.transactionsData || []).map((tx: TransactionItem, index: number) => {
                    const kind = getReportTransactionKind(tx);
                    const typeLabel = kind === 'INCOME'
                        ? 'Pemasukan'
                        : kind === 'EXPENSE'
                            ? 'Pengeluaran'
                            : kind === 'TOP_UP'
                                ? 'Top Up'
                                : kind === 'INVESTMENT_TOP_UP'
                                    ? 'Setoran Investasi'
                                    : kind === 'INVESTMENT_LIQUIDATION'
                                        ? 'Pencairan Investasi'
                                        : 'Transfer';

                    return {
                        No: index + 1,
                        Tanggal: new Date(tx.date).toLocaleDateString('id-ID'),
                        Tipe: typeLabel,
                        Pemilik: tx.owner?.name || '-',
                        Kategori: tx.activity?.name || tx.description || '-',
                        Nominal: tx.amount,
                        Catatan: tx.description || '-'
                    };
                });

                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(wealthRows), 'Riwayat Saldo');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoryRows), 'Komposisi');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trendRows), 'Tren');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), 'Transaksi');

                const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                const blob = new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                downloadBackupBlob(blob, `Catatan Keuangan Pribadi ${dateStr}.xlsx`);
                alert('Export backend gagal, jadi file Excel dibuat langsung dari data laporan yang sedang tampil.');
            } catch (fallbackError: any) {
                alert(getErrorMessage(fallbackError, getErrorMessage(error, 'Gagal export data')));
            }
        } finally {
            setExporting(false);
        }
    };

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const [transactions, meta] = await Promise.all([
                fetchTransactions({ validated: true }),
                fetchMasterMeta()
            ]);

            const liquidBalance = (meta.accounts || [])
                .filter((acc: any) => acc.type === 'Bank' || acc.type === 'E-Wallet')
                .reduce((sum: number, acc: any) => sum + Number(acc.balance || 0), 0);

            const totalRdnAssets = (meta.accounts || [])
                .filter((account: any) => account.type === 'RDN' || account.type === 'Sekuritas')
                .reduce((sum: number, account: any) => sum + Math.abs(Number(account.balance || 0)), 0);

            const filtered = transactions.filter((tx: any) => {
                const txDate = new Date(tx.date);
                if (viewMode === 'MONTHLY') {
                    return txDate.getMonth() === currentDate.getMonth()
                        && txDate.getFullYear() === currentDate.getFullYear();
                }
                return txDate.getFullYear() === currentDate.getFullYear();
            });

            const totalIncome = filtered
                .filter((tx: TransactionItem) => {
                    const kind = getReportTransactionKind(tx);
                    return kind === 'INCOME' || kind === 'INVESTMENT_LIQUIDATION' || kind === 'INVESTMENT_IN';
                })
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const totalExpense = filtered
                .filter((tx: TransactionItem) => {
                    const kind = getReportTransactionKind(tx);
                    return kind === 'EXPENSE' || kind === 'INVESTMENT_OUT';
                })
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const investmentTopUp = filtered
                .filter((tx: TransactionItem) => getReportTransactionKind(tx) === 'INVESTMENT_TOP_UP')
                .reduce((acc: number, tx: TransactionItem) => acc + tx.amount, 0);
            const investmentLiquidation = filtered
                .filter((tx: TransactionItem) => getReportTransactionKind(tx) === 'INVESTMENT_LIQUIDATION')
                .reduce((acc: number, tx: TransactionItem) => acc + tx.amount, 0);
            const zakatAmount = totalIncome * 0.025;

            const totalWealth = liquidBalance + totalRdnAssets;
            const totalVolume = filtered.reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const endingLiquidCash = estimateEndingBalanceForPeriod({
                transactions,
                currentBalance: liquidBalance,
                currentDate,
                viewMode,
                getDelta: getLiquidCashDelta
            });
            const netCashFlow = totalIncome - totalExpense - investmentTopUp;
            const wealthHistoryData = buildWealthHistoryData({
                transactions,
                totalWealth,
                currentDate,
                viewMode
            });

            const catMap: any = {};
            filtered.forEach((tx: TransactionItem) => {
                let name = tx.activity?.name;
                if (!name) {
                    const kind = getReportTransactionKind(tx);
                    if (kind === 'INCOME') name = 'Pemasukan';
                    else if (kind === 'TRANSFER') name = 'Transfer';
                    else if (kind === 'TOP_UP') name = 'Top Up';
                    else if (kind === 'INVESTMENT_TOP_UP' || kind === 'INVESTMENT_IN') name = 'Setoran Investasi';
                    else if (kind === 'INVESTMENT_LIQUIDATION' || kind === 'INVESTMENT_OUT') name = 'Pencairan Investasi';
                    else name = 'Lainnya';
                }
                catMap[name] = (catMap[name] || 0) + tx.amount;
            });
            const categoryData = Object.keys(catMap).map(name => ({
                name,
                value: catMap[name]
            })).sort((a, b) => b.value - a.value);

            const trendMap: any = {};
            filtered.forEach((tx: TransactionItem) => {
                const date = new Date(tx.date);
                const label = viewMode === 'MONTHLY' ? date.getDate().toString() : (date.getMonth() + 1).toString();
                if (!trendMap[label]) {
                    trendMap[label] = { label: viewMode === 'MONTHLY' ? `Tgl ${label}` : `Bln ${label}`, Pemasukan: 0, Pengeluaran: 0 };
                }
                const kind = getReportTransactionKind(tx);
                if (kind === 'INCOME' || kind === 'INVESTMENT_IN' || kind === 'INVESTMENT_LIQUIDATION') {
                    trendMap[label].Pemasukan += tx.amount;
                } else if (kind === 'EXPENSE' || kind === 'INVESTMENT_OUT') {
                    trendMap[label].Pengeluaran += tx.amount;
                }
            });
            const trendData = Object.values(trendMap).sort((a: any, b: any) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1]));

            setData({
                totalIncome,
                totalExpense,
                totalVolume,
                totalWealth,
                zakatAmount,
                snapshotData: {
                    investmentTopUp,
                    investmentLiquidation,
                    endingLiquidCash,
                    netCashFlow
                },
                categoryData,
                trendData,
                wealthHistoryData,
                transactionsData: filtered.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
            });
            setTxPage(1);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchReportData();
        setSelectedTx(new Set());
    }, [viewMode, currentDate]);

    useEffect(() => {
        const handleDataChanged = () => void fetchReportData();
        window.addEventListener('nova:data-changed', handleDataChanged);
        return () => {
            window.removeEventListener('nova:data-changed', handleDataChanged);
            clearLongPressTimer();
        };
    }, [viewMode, currentDate]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
            .format(val).replace('Rp', 'Rp ');

    const changeDate = (offset: number) => {
        const next = new Date(currentDate);
        if (viewMode === 'MONTHLY') next.setMonth(next.getMonth() + offset);
        else next.setFullYear(next.getFullYear() + offset);
        setCurrentDate(next);
    };

    const getEditableModalType = (tx: TransactionItem): TransactionModalType => {
        if (isInvestmentTransfer(tx) || isInvestmentLiquidation(tx)) return 'INVESTMENT';
        if (normalizeTransactionType(tx.type) === 'INCOME') return 'INCOME';
        if (normalizeTransactionType(tx.type) === 'EXPENSE') return 'EXPENSE';
        if (normalizeTransactionType(tx.type) === 'TRANSFER') return 'TRANSFER';
        return 'INCOME';
    };

    const getTypeBadge = (tx: TransactionItem) => {
        const kind = getReportTransactionKind(tx);
        if (kind === 'INCOME') return { label: 'Masuk', cls: 'bg-emerald-50 text-emerald-700' };
        if (kind === 'EXPENSE') return { label: 'Keluar', cls: 'bg-rose-50 text-rose-700' };
        if (kind === 'TRANSFER') return { label: 'Transfer', cls: 'bg-blue-50 text-blue-700' };
        if (kind === 'TOP_UP') return { label: 'Top Up', cls: 'bg-fuchsia-50 text-fuchsia-700' };
        if (kind === 'INVESTMENT_TOP_UP') return { label: 'Invest', cls: 'bg-amber-50 text-amber-700' };
        if (kind === 'INVESTMENT_LIQUIDATION') return { label: 'Cair', cls: 'bg-violet-50 text-violet-700' };
        return { label: 'Invest', cls: 'bg-amber-50 text-amber-700' };
    };

    const getAmountColor = (tx: TransactionItem) => {
        const kind = getReportTransactionKind(tx);
        if (kind === 'INCOME' || kind === 'INVESTMENT_LIQUIDATION') return 'text-emerald-600';
        if (kind === 'EXPENSE' || kind === 'INVESTMENT_TOP_UP') return 'text-rose-600';
        if (kind === 'TOP_UP') return 'text-fuchsia-600';
        return 'text-slate-900';
    };

    const getOriginBadge = (tx: TransactionItem) => (
        tx.notificationInboxId
            ? { label: 'Notif', cls: 'bg-blue-50 text-blue-600' }
            : { label: 'Manual', cls: 'bg-slate-100 text-slate-500' }
    );

    const periodLabel = viewMode === 'MONTHLY'
        ? currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase()
        : currentDate.getFullYear().toString();

    const visibleTx = data.transactionsData.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE);
    const totalPages = Math.max(1, Math.ceil(data.transactionsData.length / TX_PER_PAGE));

    if (loading) return <Spinner message="Menganalisis Laporan..." />;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-32 pt-6">

            {/* ─── Header & Controls ─── */}
            <header className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Laporan</h1>
                        <div className="mt-1 flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-500">{formatCurrency(data.totalWealth)}</p>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-slate-400">Total Aset</span>
                        </div>
                    </div>
                    <button
                        onClick={exportExcel}
                        disabled={exporting}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                        title="Download XLS"
                    >
                        {exporting ? <span className="text-xs font-bold">...</span> : <Download size={16} />}
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-1.5 rounded-[20px] border border-slate-200 shadow-sm">
                    <div className="flex w-full sm:w-auto bg-slate-100 rounded-2xl p-1">
                        {(['MONTHLY', 'YEARLY'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`flex-1 sm:flex-none rounded-xl px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {mode === 'MONTHLY' ? 'Bulan' : 'Tahun'}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between w-full sm:w-auto px-2">
                        <button onClick={() => changeDate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors">
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-800 min-w-[100px] text-center">{periodLabel}</span>
                        <button onClick={() => changeDate(1)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors">
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </header>

            {/* ─── Summary Card ─── */}
            <div className="app-hero-card rounded-3xl p-4 sm:p-5 relative overflow-hidden shadow-xl shadow-blue-900/5 border border-white/20">
                <div className="absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-20 -mt-20" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.25 }}></div>
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.15 }}></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 mb-3">Ringkasan Arus Kas</p>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {[
                            { label: 'Pemasukan', value: data.totalIncome, icon: '↘', color: 'text-emerald-300', iconBg: 'bg-emerald-400/20 text-emerald-300' },
                            { label: 'Pengeluaran', value: data.totalExpense, icon: '↗', color: 'text-rose-300', iconBg: 'bg-rose-400/20 text-rose-300' },
                            { label: 'Perputaran', value: data.totalVolume, icon: '⇄', color: 'text-sky-300', iconBg: 'bg-sky-400/20 text-sky-300' },
                            { label: 'Est. Zakat', value: data.zakatAmount, icon: '🙏', color: 'text-amber-300', iconBg: 'bg-amber-400/20 text-amber-300' },
                            { label: 'Ke Investasi', value: data.snapshotData.investmentTopUp, icon: '↑', color: 'text-orange-200', iconBg: 'bg-orange-300/20 text-orange-200' },
                            { label: 'Sisa Kas', value: data.snapshotData.endingLiquidCash, icon: '◌', color: 'text-cyan-200', iconBg: 'bg-cyan-300/20 text-cyan-200' },
                        ].map(stat => (
                            <div
                                key={stat.label}
                                className="rounded-2xl border border-white/10 bg-white/8 backdrop-blur-md px-3 py-2.5 flex flex-col justify-center min-w-0"
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${stat.iconBg}`}>
                                        <span className="text-[7px]">{stat.icon}</span>
                                    </div>
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/70 truncate">{stat.label}</p>
                                </div>
                                <p className={`text-sm font-bold truncate ${stat.color}`}>
                                    {formatCurrency(stat.value).replace('Rp', 'Rp ')}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] text-white/75">
                        <div className="flex justify-between items-center">
                            <span>Dana investasi kembali:</span>
                            <span className="font-bold text-white">{formatCurrency(data.snapshotData.investmentLiquidation)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Arus kas bersih:</span>
                            <span className={`font-bold ${data.snapshotData.netCashFlow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatCurrency(data.snapshotData.netCashFlow)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Riwayat Saldo</h2>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {viewMode === 'MONTHLY' ? 'setiap hari' : 'setiap bulan'}.
                        </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                        {data.wealthHistoryData.length} titik
                    </span>
                </div>
                {data.wealthHistoryData.length > 0 ? (
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.wealthHistoryData}>
                                <defs>
                                    <linearGradient id="wealthFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <Area
                                    type="monotone"
                                    dataKey="wealth"
                                    stroke="#2563eb"
                                    strokeWidth={3}
                                    fill="url(#wealthFill)"
                                />
                                <ChartTooltip
                                    formatter={(value) => formatCurrency(Number(value || 0))}
                                    contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px', fontSize: '11px' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                        <p className="text-sm font-bold text-slate-600">Belum ada riwayat saldo untuk periode ini</p>
                    </div>
                )}
            </div>

            {/* ─── Category Donut ─── */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Komposisi Transaksi</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{data.categoryData.length} kategori</span>
                </div>

                {data.categoryData.length > 0 ? (
                    <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-center">
                        <div className="relative h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.categoryData} cx="50%" cy="50%" innerRadius="52%" outerRadius="76%" paddingAngle={4} dataKey="value">
                                        {data.categoryData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <ChartTooltip contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '12px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Perputaran</span>
                                <span className="mt-1 max-w-[8rem] break-words text-sm font-black text-slate-900">{formatCurrency(data.totalVolume)}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {data.categoryData.map((item: { name: string; value: number }, i: number) => (
                                <div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                        <p className="truncate text-sm font-semibold text-slate-700">{item.name}</p>
                                    </div>
                                    <p className="shrink-0 text-sm font-black text-slate-900">{formatCurrency(item.value)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                        <p className="text-sm font-bold text-slate-600">Belum ada transaksi pada periode ini</p>
                    </div>
                )}
            </div>

            {/* ─── Trend Bar Chart ─── */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Tren Arus Kas</h2>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" />Pemasukan</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />Pengeluaran</span>
                </div>
                {data.trendData.length > 0 ? (
                    <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.trendData} barGap={4}>
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <Bar dataKey="Pemasukan" fill="#10b981" radius={[5, 5, 0, 0]} barSize={viewMode === 'MONTHLY' ? 8 : 18} />
                                <Bar dataKey="Pengeluaran" fill="#f43f5e" radius={[5, 5, 0, 0]} barSize={viewMode === 'MONTHLY' ? 8 : 18} />
                                <ChartTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px', fontSize: '11px' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                        <p className="text-sm font-bold text-slate-600">Belum ada data tren untuk ditampilkan</p>
                    </div>
                )}
            </div>

            {/* ─── Transactions List ─── */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Semua Transaksi</h2>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{data.transactionsData.length} data</span>
                        {selectedTx.size > 0 && (
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600">
                                {selectedTx.size} dipilih
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedTx.size > 0 && (
                            <button
                                onClick={() => setSelectedTx(new Set())}
                                className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-sm transition-colors hover:bg-slate-200"
                            >
                                Batal
                            </button>
                        )}
                        {selectedTx.size > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm transition-colors hover:bg-rose-100"
                            >
                                <Trash2 size={13} /> Hapus ({selectedTx.size})
                            </button>
                        )}
                    </div>
                </div>

                {lastDeletedTransactions.length > 0 && (
                    <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-bold text-amber-900">
                                {lastDeletedTransactions.length} transaksi terakhir siap dipulihkan
                            </p>
                            <p className="mt-1 text-[11px] text-amber-700">
                                Undo akan membuat ulang transaksi yang baru saja dihapus, lengkap dengan tanggal dan rekeningnya.
                            </p>
                        </div>
                        <button
                            onClick={handleUndoLastDelete}
                            disabled={restoringDelete}
                            className="rounded-full bg-amber-500 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {restoringDelete ? 'Memulihkan...' : 'Undo Hapus Terakhir'}
                        </button>
                    </div>
                )}

                {data.transactionsData.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="text-sm text-slate-500">Tidak ada transaksi pada periode ini</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card list */}
                        <div className="divide-y divide-slate-100 lg:hidden">
                            <div className="px-4 py-3 bg-slate-50/50">
                                <p className="text-[11px] font-bold text-slate-500">
                                    Tahan transaksi untuk mulai memilih, lalu tap transaksi lain untuk menambah pilihan.
                                </p>
                            </div>
                            {visibleTx.map((tx: TransactionItem) => {
                                const badge = getTypeBadge(tx);
                                const origin = getOriginBadge(tx);
                                return (
                                    <div
                                        key={tx.id}
                                        className={`flex items-center gap-2.5 px-4 py-3.5 transition-colors ${selectedTx.has(tx.id) ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'}`}
                                        onTouchStart={() => startLongPressSelection(tx.id)}
                                        onTouchEnd={cancelLongPressSelection}
                                        onTouchCancel={cancelLongPressSelection}
                                        onMouseDown={() => startLongPressSelection(tx.id)}
                                        onMouseUp={cancelLongPressSelection}
                                        onMouseLeave={cancelLongPressSelection}
                                        onClick={() => handleTransactionPress(tx)}
                                    >
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-800">{tx.activity?.name || tx.description || 'Transaksi'}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <p className="text-[11px] text-slate-400">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${origin.cls}`}>{origin.label}</span>
                                            </div>
                                        </div>
                                        <p className={`shrink-0 text-sm font-black ${getAmountColor(tx)}`}>{formatCurrency(tx.amount)}</p>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, activityId: tx.activityId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId });
                                                }}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                            ><Pencil size={13} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full min-w-[760px] text-left text-sm">
                                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3.5">Tanggal</th>
                                        <th className="px-5 py-3.5">Tipe</th>
                                        <th className="px-5 py-3.5">Pemilik</th>
                                        <th className="px-5 py-3.5">Kategori</th>
                                        <th className="px-5 py-3.5 text-right">Nominal</th>
                                        <th className="px-5 py-3.5 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {visibleTx.map((tx: TransactionItem) => {
                                        const badge = getTypeBadge(tx);
                                        const origin = getOriginBadge(tx);
                                        return (
                                            <tr
                                                key={tx.id}
                                                className={`transition-colors hover:bg-slate-50/60 ${selectedTx.has(tx.id) ? 'bg-blue-50/20' : ''}`}
                                                onMouseDown={() => startLongPressSelection(tx.id)}
                                                onMouseUp={cancelLongPressSelection}
                                                onMouseLeave={cancelLongPressSelection}
                                                onClick={() => handleTransactionPress(tx)}
                                            >
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <p className="font-bold text-slate-700">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>
                                                    <p className="text-[10px] text-slate-400">{new Date(tx.date).getFullYear()}</p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                                                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${origin.cls}`}>{origin.label}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 font-semibold text-slate-600">{tx.owner?.name || '-'}</td>
                                                <td className="px-5 py-4">
                                                    <p className="max-w-[180px] truncate font-semibold text-slate-800">{tx.activity?.name || '-'}</p>
                                                    {tx.description && <p className="max-w-[180px] truncate text-[11px] text-slate-400">{tx.description}</p>}
                                                </td>
                                                <td className={`px-5 py-4 text-right font-black ${getAmountColor(tx)}`}>{formatCurrency(tx.amount)}</td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, activityId: tx.activityId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId });
                                                            }}
                                                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                            title="Edit"
                                                        ><Pencil size={13} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                                <button disabled={txPage === 1} onClick={() => setTxPage(p => p - 1)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors">Sebelumnya</button>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hal {txPage} / {totalPages}</span>
                                <button disabled={txPage >= totalPages} onClick={() => setTxPage(p => p + 1)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors">Selanjutnya</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Reports;
