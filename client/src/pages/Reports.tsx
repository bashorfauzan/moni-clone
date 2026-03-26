import { useEffect, useState } from 'react';
import {
    PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, Tooltip as ChartTooltip
} from 'recharts';
import {
    ChevronLeft,
    ChevronRight,
    Calendar,
    Download,
    Pencil,
    Trash2,
    PieChart as PieChartIcon,
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import { fetchTransactions, type TransactionItem, deleteTransaction } from '../services/transactions';
import api from '../services/api';
import { fetchMasterMeta } from '../services/masterData';
import Spinner from '../components/Spinner';

const COLORS = ['#2563eb', '#0f766e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
type TransactionModalType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

type CategoryDatum = {
    name: string;
    value: number;
};

type TrendDatum = {
    label: string;
    Pemasukan: number;
    Pengeluaran: number;
};

type ReportData = {
    totalIncome: number;
    totalExpense: number;
    totalVolume: number;
    totalWealth: number;
    zakatAmount: number;
    categoryData: CategoryDatum[];
    trendData: TrendDatum[];
    transactionsData: TransactionItem[];
};

const initialData: ReportData = {
    totalIncome: 0,
    totalExpense: 0,
    totalVolume: 0,
    totalWealth: 0,
    zakatAmount: 0,
    categoryData: [],
    trendData: [],
    transactionsData: [],
};

const Reports = () => {
    const { openEditModal } = useTransaction();
    const [viewMode, setViewMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [txPage, setTxPage] = useState(1);
    const TX_PER_PAGE = 10;
    const [data, setData] = useState<ReportData>(initialData);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    const exportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get('/master/export-excel', { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nova-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal export data');
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteTransaction(id);
            await fetchReportData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus transaksi');
        }
    };

    const requestDelete = (id: string) => {
        const pin = prompt('Masukkan Password Transaksi untuk menghapus:');
        if (pin === '123456') {
            void handleDelete(id);
        } else if (pin !== null) {
            alert('Password Transaksi Salah!');
        }
    };

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const [transactions, meta] = await Promise.all([
                fetchTransactions({ validated: true }),
                fetchMasterMeta()
            ]);

            const totalRdnAssets = (meta.accounts || [])
                .filter((account: any) => account.type === 'RDN' || account.type === 'Sekuritas')
                .reduce((sum: number, account: any) => sum + Number(account.balance || 0), 0);

            const filtered = transactions.filter((tx: TransactionItem) => {
                const txDate = new Date(tx.date);
                if (viewMode === 'MONTHLY') {
                    return txDate.getMonth() === currentDate.getMonth()
                        && txDate.getFullYear() === currentDate.getFullYear();
                }

                return txDate.getFullYear() === currentDate.getFullYear();
            });

            const totalIncome = filtered
                .filter((tx) => tx.type === 'INCOME')
                .reduce((acc, tx) => acc + tx.amount, 0);
            const totalExpense = filtered
                .filter((tx) => tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT')
                .reduce((acc, tx) => acc + tx.amount, 0);
            const zakatAmount = totalIncome * 0.025;
            const liquidBalance = (meta.accounts || [])
                .filter((acc: any) => acc.type === 'Bank' || acc.type === 'E-Wallet')
                .reduce((sum: number, acc: any) => sum + Number(acc.balance || 0), 0);
            const totalWealth = liquidBalance + totalRdnAssets;
            const totalVolume = filtered.reduce((acc, tx) => acc + tx.amount, 0);

            const catMap: Record<string, number> = {};
            filtered.forEach((tx) => {
                let name = tx.activity?.name;
                if (!name) {
                    if (tx.type === 'INCOME') name = 'Pemasukan';
                    else if (tx.type === 'TRANSFER') name = 'Transfer';
                    else if (tx.type === 'INVESTMENT_IN') name = 'Pencairan Investasi';
                    else if (tx.type === 'INVESTMENT_OUT') name = 'Investasi Keluar';
                    else name = 'Lainnya';
                }
                catMap[name] = (catMap[name] || 0) + tx.amount;
            });

            const categoryData = Object.keys(catMap)
                .map((name) => ({ name, value: catMap[name] }))
                .sort((a, b) => b.value - a.value);

            const trendMap: Record<string, TrendDatum> = {};
            filtered.forEach((tx) => {
                const date = new Date(tx.date);
                const label = viewMode === 'MONTHLY'
                    ? date.getDate().toString()
                    : (date.getMonth() + 1).toString();

                if (!trendMap[label]) {
                    trendMap[label] = {
                        label: viewMode === 'MONTHLY' ? `Tgl ${label}` : `Bln ${label}`,
                        Pemasukan: 0,
                        Pengeluaran: 0,
                    };
                }

                if (tx.type === 'INCOME' || tx.type === 'INVESTMENT_IN') {
                    trendMap[label].Pemasukan += tx.amount;
                } else if (tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT') {
                    trendMap[label].Pengeluaran += tx.amount;
                }
            });

            const trendData = Object.values(trendMap).sort(
                (a, b) => parseInt(a.label.split(' ')[1], 10) - parseInt(b.label.split(' ')[1], 10)
            );

            setData({
                totalIncome,
                totalExpense,
                totalVolume,
                totalWealth,
                zakatAmount,
                categoryData,
                trendData,
                transactionsData: filtered.sort(
                    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                )
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
    }, [viewMode, currentDate]);

    useEffect(() => {
        const handleDataChanged = () => {
            void fetchReportData();
        };

        window.addEventListener('nova:data-changed', handleDataChanged);
        return () => window.removeEventListener('nova:data-changed', handleDataChanged);
    }, [viewMode, currentDate]);

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(val).replace('Rp', 'Rp ');

    const changeDate = (offset: number) => {
        const next = new Date(currentDate);
        if (viewMode === 'MONTHLY') next.setMonth(next.getMonth() + offset);
        else next.setFullYear(next.getFullYear() + offset);
        setCurrentDate(next);
    };

    const getEditableModalType = (tx: TransactionItem): TransactionModalType => {
        const isInvestmentTransfer = tx.type === 'TRANSFER'
            && ['RDN', 'Sekuritas'].includes(tx.destinationAccount?.type || '');

        if (isInvestmentTransfer || tx.type === 'INVESTMENT_OUT') {
            return 'INVESTMENT';
        }

        if (tx.type === 'INCOME' || tx.type === 'EXPENSE' || tx.type === 'TRANSFER') {
            return tx.type;
        }

        return 'INCOME';
    };

    const getTransactionLabel = (type: string) => {
        if (type === 'INCOME') return 'Masuk';
        if (type === 'EXPENSE') return 'Keluar';
        if (type === 'TRANSFER') return 'Transfer';
        if (type === 'INVESTMENT_IN') return 'Cair';
        return 'Invest';
    };

    const getTransactionTone = (type: string) => {
        if (type === 'INCOME') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        if (type === 'EXPENSE') return 'bg-rose-50 text-rose-700 border border-rose-100';
        if (type === 'TRANSFER') return 'bg-blue-50 text-blue-700 border border-blue-100';
        return 'bg-amber-50 text-amber-700 border border-amber-100';
    };

    const getAmountTone = (type: string) => {
        if (type === 'INCOME' || type === 'INVESTMENT_IN') return 'text-emerald-600';
        if (type === 'EXPENSE' || type === 'INVESTMENT_OUT') return 'text-rose-600';
        return 'text-slate-900';
    };

    const getAmountPrefix = (type: string) => {
        if (type === 'INCOME' || type === 'INVESTMENT_IN') return '+';
        if (type === 'EXPENSE' || type === 'INVESTMENT_OUT') return '-';
        return '';
    };

    const getTransactionAccountInfo = (tx: TransactionItem) => {
        const source = tx.sourceAccount?.name;
        const destination = tx.destinationAccount?.name;

        if (tx.type === 'TRANSFER' && source && destination) {
            return `${source} -> ${destination}`;
        }

        if ((tx.type === 'INCOME' || tx.type === 'INVESTMENT_IN') && destination) {
            return destination;
        }

        if ((tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT') && source) {
            return source;
        }

        return destination || source || 'Rekening belum terhubung';
    };

    const periodLabel = viewMode === 'MONTHLY'
        ? currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        : currentDate.getFullYear().toString();
    const periodHint = viewMode === 'MONTHLY' ? 'Ringkasan per bulan aktif' : 'Ringkasan per tahun aktif';
    const totalPages = Math.max(1, Math.ceil(data.transactionsData.length / TX_PER_PAGE));
    const visibleTransactions = data.transactionsData.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE);

    if (loading) return <Spinner message="Menganalisis Laporan..." />;

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-32 pt-4 md:space-y-6 md:px-8 md:pt-8">
            <header className="space-y-2 px-1">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Laporan</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                    Pantau arus kas, komposisi transaksi, dan pergerakan periode aktif dalam tampilan yang lebih ringkas.
                </p>
            </header>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="app-surface-card rounded-[30px] p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Kekayaan Tercatat</p>
                            <p className="text-3xl font-black tracking-tight text-slate-950 sm:text-[2.5rem]">
                                {formatCurrency(data.totalWealth)}
                            </p>
                            <p className="text-sm leading-relaxed text-slate-500">
                                Nilai ini menggabungkan saldo likuid dan aset investasi yang sudah tercatat.
                            </p>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700">
                            <PieChartIcon size={22} strokeWidth={2.2} />
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Mode Aktif</p>
                            <p className="mt-1 text-sm font-bold text-slate-800">
                                {viewMode === 'MONTHLY' ? 'Bulanan' : 'Tahunan'}
                            </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Periode</p>
                            <p className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-slate-800">
                                {periodLabel}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="app-surface-card rounded-[30px] p-4 sm:p-5">
                        <div className="inline-flex rounded-full bg-slate-100 p-1">
                            {(['MONTHLY', 'YEARLY'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    className={`rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-all ${
                                        viewMode === mode
                                            ? 'bg-white text-blue-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {mode === 'MONTHLY' ? 'Bulanan' : 'Tahunan'}
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 flex items-center gap-3 rounded-[24px] bg-slate-50/90 p-3 sm:p-4">
                            <button
                                type="button"
                                onClick={() => changeDate(-1)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-100"
                                aria-label="Periode sebelumnya"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            <div className="min-w-0 flex-1 text-center">
                                <div className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                                    <Calendar size={15} className="text-blue-600" />
                                    <span className="truncate">{periodLabel}</span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">{periodHint}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => changeDate(1)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-100"
                                aria-label="Periode berikutnya"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={exportExcel}
                        disabled={exporting || loading}
                        className="app-surface-card flex min-h-[88px] items-center justify-between rounded-[30px] px-5 py-4 text-left transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Export Data</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                {exporting ? 'Sedang menyiapkan file Excel...' : 'Unduh laporan periode aktif'}
                            </p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                            <Download size={18} />
                        </div>
                    </button>
                </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="app-surface-card rounded-[26px] p-4">
                    <div className="flex items-center gap-2 text-emerald-600">
                        <ArrowUpRight size={16} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pemasukan</p>
                    </div>
                    <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(data.totalIncome)}</p>
                </div>

                <div className="app-surface-card rounded-[26px] p-4">
                    <div className="flex items-center gap-2 text-rose-600">
                        <ArrowDownRight size={16} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pengeluaran</p>
                    </div>
                    <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(data.totalExpense)}</p>
                </div>

                <div className="app-surface-card rounded-[26px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Perputaran</p>
                    <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(data.totalVolume)}</p>
                </div>

                <div className="app-surface-card rounded-[26px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Estimasi Zakat</p>
                    <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(data.zakatAmount)}</p>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="app-surface-card rounded-[30px] p-5 sm:p-6">
                    <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
                        <h2 className="text-sm font-bold text-slate-900">Komposisi Transaksi</h2>
                        <p className="text-sm leading-relaxed text-slate-500">
                            Kategori yang paling dominan pada periode ini akan muncul di sini.
                        </p>
                    </div>

                    {data.categoryData.length > 0 ? (
                        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:items-center">
                            <div className="relative h-[250px] sm:h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={data.categoryData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="58%"
                                            outerRadius="82%"
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {data.categoryData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <ChartTooltip
                                            contentStyle={{
                                                background: '#fff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                boxShadow: '0 12px 28px -18px rgba(15, 23, 42, 0.35)'
                                            }}
                                            itemStyle={{ color: '#0f172a' }}
                                        />
                                    </RechartsPieChart>
                                </ResponsiveContainer>

                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Total Perputaran</span>
                                    <span className="mt-2 max-w-[9rem] break-words text-lg font-black tracking-tight text-slate-900">
                                        {formatCurrency(data.totalVolume)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {data.categoryData.map((item, index) => (
                                    <div
                                        key={`${item.name}-${index}`}
                                        className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                                    />
                                                    <p className="break-words text-sm font-bold text-slate-800">{item.name}</p>
                                                </div>
                                                <p className="mt-2 text-xs text-slate-500">
                                                    {data.totalVolume > 0 ? ((item.value / data.totalVolume) * 100).toFixed(1) : '0.0'}% dari total volume
                                                </p>
                                            </div>
                                            <p className="shrink-0 text-sm font-black text-slate-900">{formatCurrency(item.value)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
                            <p className="text-base font-bold text-slate-800">Belum ada komposisi transaksi</p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                                Saat transaksi tervalidasi mulai masuk, pembagian per kategori akan tampil di sini.
                            </p>
                        </div>
                    )}
                </div>

                <div className="app-surface-card rounded-[30px] p-5 sm:p-6">
                    <div className="flex flex-col gap-2 border-b border-slate-100 pb-4">
                        <h2 className="text-sm font-bold text-slate-900">Tren Arus Kas</h2>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="inline-flex items-center gap-2 text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                Pemasukan
                            </span>
                            <span className="inline-flex items-center gap-2 text-slate-500">
                                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                                Pengeluaran
                            </span>
                        </div>
                    </div>

                    {data.trendData.length > 0 ? (
                        <div className="mt-5 h-[260px] w-full sm:h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.trendData} barGap={8}>
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                                    />
                                    <Bar
                                        dataKey="Pemasukan"
                                        fill="#10b981"
                                        radius={[8, 8, 0, 0]}
                                        barSize={viewMode === 'MONTHLY' ? 8 : 18}
                                    />
                                    <Bar
                                        dataKey="Pengeluaran"
                                        fill="#f43f5e"
                                        radius={[8, 8, 0, 0]}
                                        barSize={viewMode === 'MONTHLY' ? 8 : 18}
                                    />
                                    <ChartTooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            boxShadow: '0 12px 28px -18px rgba(15, 23, 42, 0.35)'
                                        }}
                                        labelStyle={{ color: '#475569' }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
                            <p className="text-base font-bold text-slate-800">Belum ada tren untuk ditampilkan</p>
                            <p className="mt-2 text-sm text-slate-500">
                                Grafik akan muncul setelah ada transaksi tervalidasi pada periode yang dipilih.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            <section className="app-surface-card overflow-hidden rounded-[30px]">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">Semua Transaksi</h2>
                        <p className="mt-1 text-sm text-slate-500">Daftar transaksi tervalidasi pada periode aktif.</p>
                    </div>
                    <span className="self-start rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">
                        {data.transactionsData.length} data
                    </span>
                </div>

                {data.transactionsData.length > 0 ? (
                    <>
                        <div className="space-y-3 p-4 lg:hidden">
                            {visibleTransactions.map((tx) => (
                                <article key={tx.id} className="rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.4)]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getTransactionTone(tx.type)}`}>
                                                {getTransactionLabel(tx.type)}
                                            </div>
                                            <p className="mt-3 text-base font-bold text-slate-900">
                                                {tx.activity?.name || tx.description || 'Transaksi'}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">{getTransactionAccountInfo(tx)}</p>
                                        </div>
                                        <p className={`shrink-0 text-right text-base font-black ${getAmountTone(tx.type)}`}>
                                            {getAmountPrefix(tx.type)}
                                            {formatCurrency(tx.amount)}
                                        </p>
                                    </div>

                                    <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50/80 p-3 sm:grid-cols-2">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Tanggal</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                                {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pemilik</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-700">{tx.owner?.name || '-'}</p>
                                        </div>
                                        {tx.description && (
                                            <div className="sm:col-span-2">
                                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Catatan</p>
                                                <p className="mt-1 text-sm text-slate-600">{tx.description}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(tx.id, getEditableModalType(tx), {
                                                amount: tx.amount,
                                                description: tx.description || tx.activity?.name,
                                                ownerId: tx.ownerId,
                                                sourceAccountId: tx.sourceAccountId,
                                                destinationAccountId: tx.destinationAccountId,
                                            })}
                                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                                        >
                                            <Pencil size={15} />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => requestDelete(tx.id)}
                                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                                        >
                                            <Trash2 size={15} />
                                            Hapus
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden overflow-x-auto lg:block">
                            <table className="w-full min-w-[900px] text-left text-sm">
                                <thead className="bg-slate-50/90 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                    <tr>
                                        <th className="px-6 py-4">Tanggal</th>
                                        <th className="px-6 py-4">Tipe</th>
                                        <th className="px-6 py-4">Pemilik</th>
                                        <th className="px-6 py-4">Kategori / Catatan</th>
                                        <th className="px-6 py-4">Rekening</th>
                                        <th className="px-6 py-4 text-right">Nominal</th>
                                        <th className="px-6 py-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {visibleTransactions.map((tx) => (
                                        <tr key={tx.id} className="group transition-colors hover:bg-slate-50/70">
                                            <td className="px-6 py-5">
                                                <p className="font-bold text-slate-800">
                                                    {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                                </p>
                                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                                    {new Date(tx.date).toLocaleDateString('id-ID', { year: 'numeric' })}
                                                </p>
                                            </td>
                                            <td className="px-6 py-5">
                                                <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getTransactionTone(tx.type)}`}>
                                                    {getTransactionLabel(tx.type)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold uppercase text-slate-500">
                                                        {tx.owner?.name?.slice(0, 1) || 'U'}
                                                    </div>
                                                    <span className="font-semibold text-slate-700">{tx.owner?.name || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="max-w-[220px] truncate font-semibold text-slate-800">{tx.activity?.name || '-'}</p>
                                                {tx.description && (
                                                    <p className="mt-1 max-w-[220px] truncate text-[12px] text-slate-500">{tx.description}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="max-w-[180px] truncate text-[13px] text-slate-600">{getTransactionAccountInfo(tx)}</p>
                                            </td>
                                            <td className={`px-6 py-5 text-right text-sm font-black ${getAmountTone(tx.type)}`}>
                                                {getAmountPrefix(tx.type)}
                                                {formatCurrency(tx.amount)}
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(tx.id, getEditableModalType(tx), {
                                                            amount: tx.amount,
                                                            description: tx.description || tx.activity?.name,
                                                            ownerId: tx.ownerId,
                                                            sourceAccountId: tx.sourceAccountId,
                                                            destinationAccountId: tx.destinationAccountId,
                                                        })}
                                                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors hover:bg-blue-700 hover:text-white"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => requestDelete(tx.id)}
                                                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700 transition-colors hover:bg-rose-700 hover:text-white"
                                                        title="Hapus"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {data.transactionsData.length > TX_PER_PAGE && (
                            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-6">
                                <button
                                    type="button"
                                    disabled={txPage === 1}
                                    onClick={() => setTxPage((page) => page - 1)}
                                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Sebelumnya
                                </button>
                                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                    Halaman {txPage} dari {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={txPage >= totalPages}
                                    onClick={() => setTxPage((page) => page + 1)}
                                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Selanjutnya
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="px-5 py-10 text-center sm:px-6">
                        <p className="text-base font-bold text-slate-800">Tidak ada transaksi pada periode ini</p>
                        <p className="mt-2 text-sm text-slate-500">
                            Coba pindah periode atau tambahkan transaksi baru agar laporan terisi.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Reports;
