import { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, Tooltip as ChartTooltip
} from 'recharts';
import { ChevronLeft, ChevronRight, Calendar, Download, Pencil, Trash2 } from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import { fetchTransactions, type TransactionItem, deleteTransaction } from '../services/transactions';
import api from '../services/api';
import { fetchMasterMeta } from '../services/masterData';
import Spinner from '../components/Spinner';

const COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'];
type TransactionModalType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

const Reports = () => {
    const { openEditModal } = useTransaction();
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

            // Filter by current month/year
            const filtered = transactions.filter((tx: any) => {
                const txDate = new Date(tx.date);
                if (viewMode === 'MONTHLY') {
                    return txDate.getMonth() === currentDate.getMonth()
                        && txDate.getFullYear() === currentDate.getFullYear();
                }

                return txDate.getFullYear() === currentDate.getFullYear();
            });

            // Calculate Totals
            const totalIncome = filtered
                .filter((tx: any) => tx.type === 'INCOME')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const totalExpense = filtered
                .filter((tx: any) => tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const zakatAmount = totalIncome * 0.025;
            const lifetimeIncome = transactions
                .filter((tx: any) => tx.type === 'INCOME')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const lifetimeExpense = transactions
                .filter((tx: any) => tx.type === 'EXPENSE')
                .reduce((acc: number, tx: any) => acc + tx.amount, 0);
            const liquidBalance = lifetimeIncome - lifetimeExpense;
            const totalWealth = liquidBalance + totalRdnAssets;

            // Group by Category and Type (For Donut)
            const totalVolume = filtered.reduce((acc: number, tx: any) => acc + tx.amount, 0);

            const catMap: any = {};
            filtered.forEach((tx: any) => {
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
            const categoryData = Object.keys(catMap).map(name => ({
                name,
                value: catMap[name]
            })).sort((a, b) => b.value - a.value);

            // Trend Data (Last 6 months/years)
            const trendMap: any = {};
            filtered.forEach((tx: any) => {
                const date = new Date(tx.date);
                const label = viewMode === 'MONTHLY' ? date.getDate().toString() : (date.getMonth() + 1).toString();
                if (!trendMap[label]) {
                    trendMap[label] = { label: viewMode === 'MONTHLY' ? `Tgl ${label}` : `Bln ${label}`, Pemasukan: 0, Pengeluaran: 0 };
                }
                if (tx.type === 'INCOME' || tx.type === 'INVESTMENT_IN') {
                    trendMap[label].Pemasukan += tx.amount;
                } else if (tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT') {
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
        fetchReportData();
    }, [viewMode, currentDate]);

    useEffect(() => {
        const handleDataChanged = () => {
            void fetchReportData();
        };

        window.addEventListener('nova:data-changed', handleDataChanged);
        return () => window.removeEventListener('nova:data-changed', handleDataChanged);
    }, [viewMode, currentDate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(val);
    };

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

    if (loading) return <Spinner message="Menganalisis Laporan..." />;

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-32 pt-4 md:space-y-8 md:p-8">
            {/* Header & Filter */}
            <header className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3 flex-1">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Analisis Keuangan</p>
                            <div className="flex items-center gap-3">
                                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Laporan</h1>
                                <button
                                    onClick={exportExcel}
                                    disabled={exporting || loading}
                                    className="mt-1 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100"
                                    title="Export Excel"
                                >
                                    <Download size={14} /> 
                                    {exporting ? 'Exporting...' : '(Excel)'}
                                </button>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">Pantau arus kas, komposisi transaksi, dan pergerakan periode aktif.</p>
                        </div>
                        <div className="app-surface-card rounded-[24px] px-4 py-3 sm:px-5 inline-block">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Total Kekayaan Tercatat</p>
                            <p className="mt-1 text-xl font-black leading-tight text-slate-900 break-words">{formatCurrency(data.totalWealth)}</p>
                        </div>
                    </div>
                    <div className="bg-slate-100 p-1 rounded-2xl border border-slate-200 flex self-start">
                        <button
                            onClick={() => setViewMode('MONTHLY')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${viewMode === 'MONTHLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            BULANAN
                        </button>
                        <button
                            onClick={() => setViewMode('YEARLY')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${viewMode === 'YEARLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            TAHUNAN
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <div className="app-surface-card rounded-[28px] px-4 py-4 sm:px-5">
                        <div className="flex items-center justify-between gap-3">
                            <button onClick={() => changeDate(-1)} className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                                <ChevronLeft size={20} />
                            </button>
                            <div className="min-w-0 flex-1 px-1 text-center">
                                <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                                    <Calendar size={16} className="text-blue-600 shrink-0" />
                                    <span className="min-w-0 text-center font-bold text-xs uppercase tracking-[0.12em] sm:text-sm sm:tracking-[0.18em] text-slate-700 break-words">
                                        {viewMode === 'MONTHLY'
                                            ? currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                                            : currentDate.getFullYear()}
                                    </span>
                                </div>
                                <p className="mt-2 text-[10px] font-semibold text-slate-500 sm:text-[11px]">
                                    {viewMode === 'MONTHLY' ? 'Ringkasan per bulan aktif' : 'Ringkasan per tahun aktif'}
                                </p>
                            </div>
                            <button onClick={() => changeDate(1)} className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <section className="app-hero-card relative mb-6 overflow-hidden rounded-3xl p-4 sm:p-5">
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl -mr-16 -mt-16" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.18 }}></div>
                <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full blur-3xl -ml-14 -mb-14" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.12 }}></div>
                <div className="relative z-10">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Ringkasan Periode</p>
                            <p className="mt-1 text-sm text-white/70">Angka utama untuk periode yang sedang Anda lihat.</p>
                        </div>
                        <div className="self-start rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
                            {viewMode === 'MONTHLY' ? 'Bulanan' : 'Tahunan'}
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Pemasukan</p>
                            <p className="mt-1 text-sm font-bold text-emerald-300 break-all leading-snug">{formatCurrency(data.totalIncome)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Pengeluaran</p>
                            <p className="mt-1 text-sm font-bold text-rose-300 break-all leading-snug">{formatCurrency(data.totalExpense)}</p>
                        </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Perputaran</p>
                            <p className="mt-1 text-sm font-bold text-white break-all leading-snug">{formatCurrency(data.totalVolume)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">
                                Zakat {viewMode === 'MONTHLY' ? 'Bulan Ini' : 'Thn Ini'}
                            </p>
                            <p className="mt-1 text-sm font-bold text-emerald-300 break-all leading-snug">{formatCurrency(data.zakatAmount)}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Donut Chart Section */}
            <section className="bg-white border border-slate-100 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-50 px-2 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Komposisi Transaksi</h2>
                        <p className="mt-2 text-sm text-slate-500">Lihat kategori mana yang paling banyak membentuk perputaran pada periode ini.</p>
                    </div>
                    <div className="self-start rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {data.categoryData.length} kategori aktif
                    </div>
                </div>

                <div className={`mt-6 grid gap-5 ${data.categoryData.length > 0 ? 'lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-center' : ''}`}>
                    {data.categoryData.length > 0 ? (
                        <>
                            <div className="relative h-[240px] sm:h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.categoryData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="54%"
                                            outerRadius="78%"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {data.categoryData.map((_: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <ChartTooltip
                                            contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            itemStyle={{ color: '#0f172a' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                                    <span className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Perputaran</span>
                                    <span className="max-w-[8rem] break-words text-sm font-black tracking-tight text-slate-800 sm:max-w-[9rem]">{formatCurrency(data.totalVolume)}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {data.categoryData.map((item: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                                            <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-bold text-slate-700">{item.name}</p>
                                                <p className="text-[11px] font-semibold text-slate-400">
                                                    {data.totalVolume > 0 ? ((item.value / data.totalVolume) * 100).toFixed(1) : 0}% dari total
                                                </p>
                                            </div>
                                        </div>
                                        <p className="shrink-0 text-right text-sm font-black text-slate-900">{formatCurrency(item.value)}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">%</div>
                            <p className="mt-4 text-base font-bold text-slate-700">Belum ada komposisi transaksi</p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                                Saat transaksi tervalidasi mulai masuk di periode ini, ringkasan kategori akan muncul di sini.
                            </p>
                            <div className="mt-5 rounded-2xl bg-white px-4 py-3 shadow-sm">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Perputaran Saat Ini</p>
                                <p className="mt-1 text-lg font-black text-slate-800">{formatCurrency(data.totalVolume)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Trend Chart */}
            <section className="bg-white border border-slate-100 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-sm mb-10">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <span>Tren Arus Kas</span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Pemasukan</span>
                    <span className="flex items-center gap-1 text-[10px] text-rose-500"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Pengeluaran</span>
                </h2>
                {data.trendData.length > 0 ? (
                    <div className="mt-6 h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.trendData}>
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                                />
                                <Bar
                                    dataKey="Pemasukan"
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                    barSize={12}
                                />
                                <Bar
                                    dataKey="Pengeluaran"
                                    fill="#f43f5e"
                                    radius={[4, 4, 0, 0]}
                                    barSize={12}
                                />
                                <ChartTooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '8px', fontSize: '10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ display: 'none' }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="mt-6 rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center">
                        <p className="text-sm font-bold text-slate-700">Belum ada tren untuk ditampilkan</p>
                        <p className="mt-2 text-sm text-slate-500">Grafik akan muncul setelah ada transaksi tervalidasi pada periode yang dipilih.</p>
                    </div>
                )}
            </section>

            {/* Transactions Table */}
            <section className="bg-white border border-slate-100 rounded-[28px] sm:rounded-[32px] shadow-sm overflow-hidden mb-10">
                <div className="p-5 sm:p-6 border-b border-slate-50 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2">Semua Transaksi</h2>
                    <span className="self-start text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{data.transactionsData.length} Data</span>
                </div>

                <div className="overflow-x-auto w-full max-w-full">
                    <table className="w-full min-w-[860px] text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
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
                        <tbody className="divide-y divide-slate-100/50">
                            {data.transactionsData.slice((txPage - 1) * TX_PER_PAGE, txPage * TX_PER_PAGE).map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <p className="font-bold text-slate-700">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>
                                        <p className="text-[10px] text-slate-400">{new Date(tx.date).toLocaleDateString('id-ID', { year: 'numeric' })}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tx.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' :
                                                tx.type === 'EXPENSE' ? 'bg-rose-100 text-rose-700' :
                                                    tx.type === 'TRANSFER' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {tx.type === 'INCOME' ? 'Pemasukan' : tx.type === 'EXPENSE' ? 'Pengeluaran' : tx.type === 'TRANSFER' ? 'Transfer' : 'Investasi'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="font-bold text-slate-700">{tx.owner?.name || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-slate-900 line-clamp-1">{tx.activity?.name || '-'}</p>
                                        {tx.description && <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{tx.description}</p>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            {tx.sourceAccount && (
                                                <span className="text-[10px] font-bold text-slate-500 flex gap-1 items-center">
                                                    <span className="w-4 text-center text-slate-300">D:</span>
                                                    {tx.sourceAccount.name} <span className="opacity-50">({tx.sourceAccount.owner?.name || '-'})</span>
                                                </span>
                                            )}
                                            {tx.destinationAccount && (
                                                <span className="text-[10px] font-bold text-slate-500 flex gap-1 items-center">
                                                    <span className="w-4 text-center text-slate-300">K:</span>
                                                    {tx.destinationAccount.name} <span className="opacity-50">({tx.destinationAccount.owner?.name || '-'})</span>
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`px-6 py-4 text-right font-bold ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {tx.type === 'EXPENSE' ? '-' : ''}{formatCurrency(tx.amount)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(tx.id, getEditableModalType(tx as TransactionItem), {
                                                    amount: tx.amount,
                                                    description: tx.description || tx.activity?.name,
                                                    ownerId: tx.ownerId,
                                                    sourceAccountId: tx.sourceAccountId,
                                                    destinationAccountId: tx.destinationAccountId,
                                                })}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-all active:scale-95 shadow-sm"
                                                title="Edit"
                                                aria-label="Edit"
                                            >
                                                <Pencil size={15} strokeWidth={2.5} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const pin = prompt('Masukkan Password Transaksi untuk menghapus:');
                                                    if (pin === '123456') {
                                                        handleDelete(tx.id);
                                                    } else if (pin !== null) {
                                                        alert('Password Transaksi Salah!');
                                                    }
                                                }}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all active:scale-95 shadow-sm"
                                                title="Hapus"
                                                aria-label="Hapus"
                                            >
                                                <Trash2 size={15} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {data.transactionsData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-sm italic">
                                        Tidak ada transaksi pada periode ini
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {data.transactionsData.length > TX_PER_PAGE && (
                    <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-slate-50/50">
                        <button
                            disabled={txPage === 1}
                            onClick={() => setTxPage(p => p - 1)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl disabled:opacity-30 transition-colors"
                        >
                            Sebelumnya
                        </button>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Halaman {txPage} dari {Math.ceil(data.transactionsData.length / TX_PER_PAGE)}
                        </span>
                        <button
                            disabled={txPage >= Math.ceil(data.transactionsData.length / TX_PER_PAGE)}
                            onClick={() => setTxPage(p => p + 1)}
                            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl disabled:opacity-30 transition-colors"
                        >
                            Selanjutnya
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Reports;
