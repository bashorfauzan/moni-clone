import { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, Tooltip as ChartTooltip
} from 'recharts';
import { ChevronLeft, ChevronRight, Calendar, Download, Pencil, Trash2, CheckSquare, Square } from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import { fetchTransactions, type TransactionItem, deleteTransaction } from '../services/transactions';
import api from '../services/api';
import { fetchMasterMeta } from '../services/masterData';
import { useSecurity } from '../context/SecurityContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';

const COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'];
type TransactionModalType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

const isInvestmentAccountType = (type?: string) => type === 'RDN' || type === 'Sekuritas';

const isInvestmentTopUp = (tx: TransactionItem) =>
    tx.type === 'TRANSFER' && isInvestmentAccountType(tx.destinationAccount?.type);

const isInvestmentLiquidation = (tx: TransactionItem) =>
    tx.type === 'TRANSFER' && isInvestmentAccountType(tx.sourceAccount?.type);

const getReportTransactionKind = (tx: TransactionItem) => {
    if (isInvestmentTopUp(tx)) return 'INVESTMENT_TOP_UP';
    if (isInvestmentLiquidation(tx)) return 'INVESTMENT_LIQUIDATION';
    return tx.type;
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
        categoryData: [],
        trendData: [],
        transactionsData: [],
    });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [selectedTx, setSelectedTx] = useState<Set<string>>(new Set());

    const toggleSelectTx = (id: string) => {
        const next = new Set(selectedTx);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTx(next);
    };

    const toggleSelectAll = () => {
        const visibleIds = data.transactionsData.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE).map((tx: any) => tx.id);
        if (selectedTx.size === visibleIds.length && visibleIds.every((id: string) => selectedTx.has(id))) {
            setSelectedTx(new Set());
        } else {
            setSelectedTx(new Set(visibleIds));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedTx.size === 0) return;
        const authorized = await verifySecurity(`Hapus ${selectedTx.size} Transaksi`);
        if (!authorized) return;

        try {
            await api.post('/transactions/bulk-delete', { ids: Array.from(selectedTx) });
            setSelectedTx(new Set());
            await fetchReportData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal menghapus transaksi terpilih'));
        }
    };

    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get('/master/export-excel', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
            a.download = `Catatan Keuangan Pribadi ${dateStr}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal export data'));
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async (id: string) => {
        const authorized = await verifySecurity('Hapus Transaksi');
        if (!authorized) return;

        try {
            await deleteTransaction(id);
            await fetchReportData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal menghapus transaksi'));
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
                    return kind === 'EXPENSE' || kind === 'INVESTMENT_OUT' || kind === 'INVESTMENT_TOP_UP';
                })
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const zakatAmount = totalIncome * 0.025;
            
            const totalWealth = liquidBalance + totalRdnAssets;
            const totalVolume = filtered.reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const catMap: any = {};
            filtered.forEach((tx: TransactionItem) => {
                let name = tx.activity?.name;
                if (!name) {
                    const kind = getReportTransactionKind(tx);
                    if (kind === 'INCOME') name = 'Pemasukan';
                    else if (kind === 'TRANSFER') name = 'Transfer';
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
                } else if (kind === 'EXPENSE' || kind === 'INVESTMENT_OUT' || kind === 'INVESTMENT_TOP_UP') {
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
                categoryData,
                trendData,
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
        return () => window.removeEventListener('nova:data-changed', handleDataChanged);
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
        const isInvestmentTransfer = isInvestmentTopUp(tx);
        if (isInvestmentTransfer || tx.type === 'INVESTMENT_OUT') return 'INVESTMENT';
        if (tx.type === 'INCOME' || tx.type === 'EXPENSE' || tx.type === 'TRANSFER') return tx.type;
        return 'INCOME';
    };

    const getTypeBadge = (tx: TransactionItem) => {
        const kind = getReportTransactionKind(tx);
        if (kind === 'INCOME') return { label: 'Masuk', cls: 'bg-emerald-50 text-emerald-700' };
        if (kind === 'EXPENSE') return { label: 'Keluar', cls: 'bg-rose-50 text-rose-700' };
        if (kind === 'TRANSFER') return { label: 'Transfer', cls: 'bg-blue-50 text-blue-700' };
        if (kind === 'INVESTMENT_TOP_UP' || kind === 'INVESTMENT_IN') return { label: 'Invest', cls: 'bg-amber-50 text-amber-700' };
        if (kind === 'INVESTMENT_LIQUIDATION' || kind === 'INVESTMENT_OUT') return { label: 'Cair', cls: 'bg-violet-50 text-violet-700' };
        return { label: 'Invest', cls: 'bg-amber-50 text-amber-700' };
    };

    const getAmountColor = (tx: TransactionItem) => {
        const kind = getReportTransactionKind(tx);
        if (kind === 'INCOME' || kind === 'INVESTMENT_IN' || kind === 'INVESTMENT_LIQUIDATION') return 'text-emerald-600';
        if (kind === 'EXPENSE' || kind === 'INVESTMENT_OUT' || kind === 'INVESTMENT_TOP_UP') return 'text-rose-600';
        return 'text-slate-900';
    };

    const periodLabel = viewMode === 'MONTHLY'
        ? currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase()
        : currentDate.getFullYear().toString();

    const visibleTx = data.transactionsData.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE);
    const totalPages = Math.max(1, Math.ceil(data.transactionsData.length / TX_PER_PAGE));

    if (loading) return <Spinner message="Menganalisis Laporan..." />;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-5 pb-32 pt-6">

            {/* ─── Header ─── */}
            <header className="flex flex-col gap-6 sm:flex-row sm:items-end justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">Laporan Keuangan</h1>
                    <p className="mt-1 text-sm text-slate-500 max-w-sm">
                        Pantau arus kas dan aset pada periode aktif.
                    </p>
                </div>
                
                <div className="text-left sm:text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Kekayaan Tercatat</p>
                    <div className="mt-1 flex items-center sm:justify-end gap-3">
                        <p className="text-2xl font-black text-slate-900">{formatCurrency(data.totalWealth)}</p>
                        <button
                            onClick={exportExcel}
                            disabled={exporting}
                            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                            <Download size={12} /> {exporting ? '...' : 'XLS'}
                        </button>
                    </div>
                </div>
            </header>

            {/* ─── Period Control Bar ─── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.03)]">
                <div className="flex bg-slate-50 rounded-xl p-1 w-full sm:w-auto">
                    {(['MONTHLY', 'YEARLY'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {mode === 'MONTHLY' ? 'Bulanan' : 'Tahunan'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-1 px-1">
                    <button onClick={() => changeDate(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2 px-3">
                        <Calendar size={14} className="text-blue-600 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-800">{periodLabel}</span>
                    </div>
                    <button onClick={() => changeDate(1)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* ─── Summary Card ─── */}
            <div className="app-hero-card rounded-[32px] p-5 relative overflow-hidden shadow-xl shadow-blue-900/5 border border-white/20">
                <div className="absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-20 -mt-20" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.25 }}></div>
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.15 }}></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 mb-4">Ringkasan Arus Kas</p>
                    
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        {[
                            { label: 'Pemasukan', value: data.totalIncome, icon: '↘', color: 'text-emerald-300', iconBg: 'bg-emerald-400/20 text-emerald-300' },
                            { label: 'Pengeluaran', value: data.totalExpense, icon: '↗', color: 'text-rose-300', iconBg: 'bg-rose-400/20 text-rose-300' },
                            { label: 'Perputaran', value: data.totalVolume, icon: '⇄', color: 'text-sky-300', iconBg: 'bg-sky-400/20 text-sky-300' },
                            { label: 'Est. Zakat', value: data.zakatAmount, icon: '🙏', color: 'text-amber-300', iconBg: 'bg-amber-400/20 text-amber-300' },
                        ].map(stat => (
                            <div
                                key={stat.label}
                                className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-4 py-3 flex flex-col justify-center min-w-0"
                            >
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${stat.iconBg}`}>
                                        <span className="text-[8px]">{stat.icon}</span>
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 truncate">{stat.label}</p>
                                </div>
                                <p className={`text-sm sm:text-base font-bold truncate ${stat.color}`}>
                                    {formatCurrency(stat.value).replace('Rp', 'Rp ')}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
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
                    </div>
                    {selectedTx.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm transition-colors hover:bg-rose-100"
                        >
                            <Trash2 size={13} /> Hapus ({selectedTx.size})
                        </button>
                    )}
                </div>

                {data.transactionsData.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="text-sm text-slate-500">Tidak ada transaksi pada periode ini</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card list */}
                        <div className="divide-y divide-slate-100 lg:hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/50">
                                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-600 transition-colors">
                                    {selectedTx.size === visibleTx.length && visibleTx.length > 0 ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                                </button>
                                <span className="text-[11px] font-bold text-slate-500">PILIH SEMUA</span>
                            </div>
                            {visibleTx.map((tx: TransactionItem) => {
                                const badge = getTypeBadge(tx);
                                return (
                                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                                        <button onClick={() => toggleSelectTx(tx.id)} className="shrink-0 text-slate-300 hover:text-blue-600 transition-colors">
                                            {selectedTx.has(tx.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                                        </button>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-800">{tx.activity?.name || tx.description || 'Transaksi'}</p>
                                            <p className="text-[11px] text-slate-400">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                        <p className={`shrink-0 text-sm font-black ${getAmountColor(tx)}`}>{formatCurrency(tx.amount)}</p>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={() => openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId })}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                            ><Pencil size={13} /></button>
                                            <button
                                                onClick={() => void handleDelete(tx.id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                            ><Trash2 size={13} /></button>
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
                                        <th className="px-5 py-3.5 w-10 text-center">
                                            <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center">
                                                {selectedTx.size === visibleTx.length && visibleTx.length > 0 ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                            </button>
                                        </th>
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
                                        return (
                                            <tr key={tx.id} className={`transition-colors hover:bg-slate-50/60 ${selectedTx.has(tx.id) ? 'bg-blue-50/20' : ''}`}>
                                                <td className="px-5 py-4 whitespace-nowrap text-center">
                                                    <button onClick={() => toggleSelectTx(tx.id)} className="text-slate-300 hover:text-blue-600 transition-colors flex items-center justify-center">
                                                        {selectedTx.has(tx.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                                    </button>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <p className="font-bold text-slate-700">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>
                                                    <p className="text-[10px] text-slate-400">{new Date(tx.date).getFullYear()}</p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
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
                                                            onClick={() => openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId })}
                                                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                            title="Edit"
                                                        ><Pencil size={13} /></button>
                                                        <button
                                                            onClick={() => void handleDelete(tx.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                                            title="Hapus"
                                                        ><Trash2 size={13} /></button>
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
