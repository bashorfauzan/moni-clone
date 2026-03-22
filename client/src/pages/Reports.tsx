import { useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, Tooltip as ChartTooltip
} from 'recharts';
import { ChevronLeft, ChevronRight, Calendar, Download } from 'lucide-react';
import { fetchTransactions } from '../services/transactions';
import api from '../services/api';

const COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#F472B6'];

const Reports = () => {
    const [viewMode, setViewMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [txPage, setTxPage] = useState(1);
    const TX_PER_PAGE = 10;
    const [data, setData] = useState<any>({
        totalIncome: 0,
        totalExpense: 0,
        totalVolume: 0,
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
            a.download = `spend-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

    useEffect(() => {
        const fetchReportData = async () => {
            setLoading(true);
            try {
                const transactions = await fetchTransactions({ validated: true });

                // Filter by current month/year
                const filtered = transactions.filter((tx: any) => {
                    const txDate = new Date(tx.date);
                    if (viewMode === 'MONTHLY') {
                        return txDate.getMonth() === currentDate.getMonth() &&
                            txDate.getFullYear() === currentDate.getFullYear();
                    } else {
                        return txDate.getFullYear() === currentDate.getFullYear();
                    }
                });

                // Calculate Totals
                const totalIncome = filtered
                    .filter((tx: any) => tx.type === 'INCOME')
                    .reduce((acc: number, tx: any) => acc + tx.amount, 0);
                const totalExpense = filtered
                    .filter((tx: any) => tx.type === 'EXPENSE' || tx.type === 'INVESTMENT_OUT')
                    .reduce((acc: number, tx: any) => acc + tx.amount, 0);

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

                setData({ totalIncome, totalExpense, totalVolume, categoryData, trendData, transactionsData: filtered.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) });
                setTxPage(1);
            } catch (error) {
                console.error('Error fetching reports:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReportData();
    }, [viewMode, currentDate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(val);
    };

    const changeDate = (offset: number) => {
        const next = new Date(currentDate);
        if (viewMode === 'MONTHLY') next.setMonth(next.getMonth() + offset);
        else next.setFullYear(next.getFullYear() + offset);
        setCurrentDate(next);
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Memuat Laporan...</div>;

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            {/* Header & Filter */}
            <header className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold italic text-slate-900">Laporan</h1>
                    <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex self-start">
                        <button
                            onClick={() => setViewMode('MONTHLY')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'MONTHLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            BULANAN
                        </button>
                        <button
                            onClick={() => setViewMode('YEARLY')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'YEARLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                        >
                            TAHUNAN
                        </button>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1 flex items-center justify-between bg-white border border-slate-100 p-4 rounded-2xl shadow-sm w-full">
                        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-blue-600" />
                            <span className="font-bold text-sm uppercase tracking-widest text-slate-700">
                                {viewMode === 'MONTHLY'
                                    ? currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                                    : currentDate.getFullYear()}
                            </span>
                        </div>
                        <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <button
                        onClick={exportExcel}
                        disabled={exporting || loading}
                        className="w-full sm:w-auto px-6 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-600 font-bold uppercase tracking-widest text-xs hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm"
                    >
                        <Download size={16} /> {exporting ? 'Mengekspor...' : 'Export (Excel)'}
                    </button>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Pemasukan</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(data.totalIncome)}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Pengeluaran</p>
                    <p className="text-lg font-bold text-rose-600">{formatCurrency(data.totalExpense)}</p>
                </div>
            </div>

            {/* Donut Chart Section */}
            <section className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 pb-6 border-b border-slate-50">Komposisi Transaksi</h2>

                <div className="h-64 relative mt-6">
                    {data.categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.categoryData}
                                    innerRadius={85}
                                    outerRadius={110}
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
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 italic text-sm font-medium">Tidak ada data</div>
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Perputaran</span>
                        <span className="text-sm font-black text-slate-800 tracking-tight">{formatCurrency(data.totalVolume)}</span>
                    </div>
                </div>

                {/* Category List */}
                <div className="space-y-4 pt-6 border-t border-slate-50 mt-6">
                    {data.categoryData.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center group">
                            <div className="flex items-center gap-4">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                <span className="text-sm font-bold text-slate-600">{item.name}</span>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-slate-900">{formatCurrency(item.value)}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{data.totalVolume > 0 ? ((item.value / data.totalVolume) * 100).toFixed(1) : 0}%</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Trend Chart */}
            <section className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm mb-10">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 flex gap-4">
                    <span>Tren Arus Kas</span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Pemasukan</span>
                    <span className="flex items-center gap-1 text-[10px] text-rose-500"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Pengeluaran</span>
                </h2>
                <div className="h-48 w-full mt-6">
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
            </section>

            {/* Transactions Table */}
            <section className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden mb-10">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2">Semua Transaksi</h2>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{data.transactionsData.length} Data</span>
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
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                            tx.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' :
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
                                </tr>
                            ))}
                            {data.transactionsData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-sm italic">
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
