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

            const filtered = transactions.filter((tx: any) => {
                const txDate = new Date(tx.date);
                if (viewMode === 'MONTHLY') {
                    return txDate.getMonth() === currentDate.getMonth()
                        && txDate.getFullYear() === currentDate.getFullYear();
                }
                return txDate.getFullYear() === currentDate.getFullYear();
            });

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
        void fetchReportData();
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
        const isInvestmentTransfer = tx.type === 'TRANSFER'
            && ['RDN', 'Sekuritas'].includes(tx.destinationAccount?.type || '');
        if (isInvestmentTransfer || tx.type === 'INVESTMENT_OUT') return 'INVESTMENT';
        if (tx.type === 'INCOME' || tx.type === 'EXPENSE' || tx.type === 'TRANSFER') return tx.type;
        return 'INCOME';
    };

    const getTypeBadge = (type: string) => {
        if (type === 'INCOME') return { label: 'Masuk', cls: 'bg-emerald-50 text-emerald-700' };
        if (type === 'EXPENSE') return { label: 'Keluar', cls: 'bg-rose-50 text-rose-700' };
        if (type === 'TRANSFER') return { label: 'Transfer', cls: 'bg-blue-50 text-blue-700' };
        if (type === 'INVESTMENT_IN') return { label: 'Cair', cls: 'bg-violet-50 text-violet-700' };
        return { label: 'Invest', cls: 'bg-amber-50 text-amber-700' };
    };

    const getAmountColor = (type: string) => {
        if (type === 'INCOME' || type === 'INVESTMENT_IN') return 'text-emerald-600';
        if (type === 'EXPENSE' || type === 'INVESTMENT_OUT') return 'text-rose-600';
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
            <header className="space-y-4">
                <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-2">ANALISIS KEUANGAN</p>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-black tracking-tighter text-slate-900">Laporan</h1>
                        <button
                            onClick={exportExcel}
                            disabled={exporting}
                            className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50"
                        >
                            <Download size={14} />
                            {exporting ? 'Expt...' : '(EXCEL)'}
                        </button>
                    </div>
                    <p className="mt-3 text-[15px] leading-relaxed text-slate-500 max-w-sm">
                        Pantau arus kas, komposisi transaksi, dan pergerakan periode aktif.
                    </p>
                </div>

                {/* ─── Total Wealth ─── */}
                <div className="rounded-[2rem] bg-white border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] px-6 py-6 w-max min-w-[280px]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">TOTAL KEKAYAAN TERCATAT</p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{formatCurrency(data.totalWealth)}</p>
                </div>
            </header>

            {/* ─── Mode Toggle + Period Navigator ─── */}
            <div className="space-y-6">
                <div className="inline-flex rounded-2xl bg-slate-50/80 p-1.5 border border-slate-100">
                    {(['MONTHLY', 'YEARLY'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`rounded-xl px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {mode === 'MONTHLY' ? 'BULANAN' : 'TAHUNAN'}
                        </button>
                    ))}
                </div>

                <div className="rounded-[2.5rem] bg-white border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] px-4 pt-4 pb-5 flex flex-col items-center gap-3">
                    <div className="flex items-center w-full justify-between px-2">
                        <button
                            onClick={() => changeDate(-1)}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center justify-center gap-2.5 bg-slate-50/80 px-5 py-2.5 rounded-2xl">
                            <Calendar size={16} className="text-blue-600 shrink-0" />
                            <span className="text-[13px] font-bold uppercase tracking-[0.15em] text-slate-800">{periodLabel}</span>
                        </div>
                        <button
                            onClick={() => changeDate(1)}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <p className="text-[11px] font-medium text-slate-400">
                        {viewMode === 'MONTHLY' ? 'Ringkasan per bulan aktif' : 'Ringkasan per tahun aktif'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'PEMASUKAN', value: data.totalIncome, color: 'text-emerald-600' },
                    { label: 'PENGELUARAN', value: data.totalExpense, color: 'text-rose-600' },
                    { label: 'PERPUTARAN', value: data.totalVolume, color: 'text-slate-900' },
                    { label: 'EST. ZAKAT', value: data.zakatAmount, color: 'text-amber-600' },
                ].map(stat => (
                    <div key={stat.label} className="rounded-3xl bg-white border border-slate-100 shadow-sm px-5 py-4 flex flex-col justify-center">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">{stat.label}</p>
                        <p className={`mt-2 text-[15px] font-black tracking-tight break-all ${stat.color}`}>{formatCurrency(stat.value)}</p>
                    </div>
                ))}
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
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Semua Transaksi</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{data.transactionsData.length} data</span>
                </div>

                {data.transactionsData.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="text-sm text-slate-500">Tidak ada transaksi pada periode ini</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile card list */}
                        <div className="divide-y divide-slate-100 lg:hidden">
                            {visibleTx.map((tx: TransactionItem) => {
                                const badge = getTypeBadge(tx.type);
                                return (
                                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>{badge.label}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-800">{tx.activity?.name || tx.description || 'Transaksi'}</p>
                                            <p className="text-[11px] text-slate-400">{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                        <p className={`shrink-0 text-sm font-black ${getAmountColor(tx.type)}`}>{formatCurrency(tx.amount)}</p>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={() => openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId })}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                            ><Pencil size={13} /></button>
                                            <button
                                                onClick={() => { const p = prompt('Masukkan Password Transaksi:'); if (p === '123456') void handleDelete(tx.id); else if (p !== null) alert('Password Salah!'); }}
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
                                        const badge = getTypeBadge(tx.type);
                                        return (
                                            <tr key={tx.id} className="transition-colors hover:bg-slate-50/60">
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
                                                <td className={`px-5 py-4 text-right font-black ${getAmountColor(tx.type)}`}>{formatCurrency(tx.amount)}</td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => openEditModal(tx.id, getEditableModalType(tx), { amount: tx.amount, description: tx.description || tx.activity?.name, ownerId: tx.ownerId, sourceAccountId: tx.sourceAccountId, destinationAccountId: tx.destinationAccountId })}
                                                            className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                            title="Edit"
                                                        ><Pencil size={13} /></button>
                                                        <button
                                                            onClick={() => { const p = prompt('Masukkan Password Transaksi:'); if (p === '123456') void handleDelete(tx.id); else if (p !== null) alert('Password Salah!'); }}
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
