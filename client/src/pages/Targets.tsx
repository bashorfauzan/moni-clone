import { useState, useEffect } from 'react';
import api from '../services/api';
import { Plus, Trash2, X, Save, Pencil, Calendar, ArrowUpRight, Target as TargetIcon } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { fetchTargets, type TargetItem } from '../services/targets';
import { fetchTransactions, type TransactionItem } from '../services/transactions';
import Spinner from '../components/Spinner';

const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');

const diffInCalendarMonthsInclusive = (startValue?: string | null, endValue?: string | null) => {
    if (!startValue || !endValue) return null;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const months = ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
};

const Targets = () => {
    const [data, setData] = useState<any>({ accounts: [], owners: [] });
    const [targets, setTargets] = useState<TargetItem[]>([]);
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [form, setForm] = useState({
        title: '',
        totalAmount: '',
        monthCount: '',
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [metaRes, targetRes, transactionRes] = await Promise.all([
                    fetchMasterMeta(),
                    fetchTargets(),
                    fetchTransactions({ validated: true })
                ]);
                setData({ accounts: metaRes.accounts, owners: metaRes.owners });
                setTargets(targetRes.targets || []);
                setTransactions(transactionRes);
            } catch (error) {
                console.error('Error fetching liquidity data:', error);
            } finally {
                setLoading(false);
            }
        };
        void fetchData();
    }, []);

    const formatCurrency = (val: number) => new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(val).replace('Rp', 'Rp ');

    const refetchTargets = async () => {
        const targetRes = await fetchTargets();
        setTargets(targetRes.targets || []);
    };

    const resetTargetForm = () => {
        setForm({ title: '', totalAmount: '', monthCount: '' });
        setEditingTargetId(null);
    };

    const openAddTargetModal = () => {
        resetTargetForm();
        setIsTargetModalOpen(true);
    };

    const openEditTargetModal = (target: TargetItem) => {
        setEditingTargetId(target.id);
        setForm({
            title: target.title || '',
            totalAmount: String(target.totalAmount || ''),
            monthCount: String(diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 12),
        });
        setIsTargetModalOpen(true);
    };

    const closeTargetModal = () => {
        setIsTargetModalOpen(false);
        resetTargetForm();
    };

    const handleSaveTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) {
            alert('Nama target wajib diisi');
            return;
        }
        if (!form.totalAmount || Number(form.totalAmount) <= 0) {
            alert('Nominal target harus lebih dari 0');
            return;
        }
        if (!form.monthCount || Number(form.monthCount) <= 0) {
            alert('Jumlah bulan harus lebih dari 0');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                title: form.title.trim(),
                totalAmount: Number(form.totalAmount),
                monthCount: Number(form.monthCount),
                ownerId: data.owners[0]?.id || undefined
            };

            if (editingTargetId) {
                await api.put(`/targets/${editingTargetId}`, payload);
            } else {
                await api.post('/targets', payload);
            }

            resetTargetForm();
            await refetchTargets();
            window.dispatchEvent(new Event('nova:data-changed'));
            setIsTargetModalOpen(false);
        } catch (error: any) {
            console.error(error);
            const message = error?.response?.data?.detail
                || error?.response?.data?.error
                || 'Gagal menambah target';
            alert(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTarget = async (id: string) => {
        if (!window.confirm('Hapus target ini?')) return;
        try {
            await api.delete(`/targets/${id}`);
            await refetchTargets();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error) {
            console.error(error);
            alert('Gagal menghapus target');
        }
    };

    if (loading) return <Spinner message="Menganalisis Likuiditas..." />;

    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

    const activeTargets = targets.filter((target) => target.isActive);
    const totalTargetAmount = activeTargets.reduce((sum, target) => sum + target.totalAmount, 0);
    const totalRemainingAmount = activeTargets.reduce((sum, target) => sum + Math.max(0, target.remainingAmount), 0);
    const totalMonthlyNeed = activeTargets.reduce((sum, target) => {
        const months = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
        return sum + (target.totalAmount / months);
    }, 0);

    const bankIncomeMonth = transactions
        .filter((tx) => {
            const txDate = new Date(tx.date);
            return tx.type === 'INCOME'
                && txDate >= startOfMonth
                && txDate < endOfMonth
                && (tx.destinationAccount?.type === 'Bank' || tx.destinationAccount?.type === 'E-Wallet');
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

    const activeRemaining = Math.max(0, totalTargetAmount - bankIncomeMonth);
    const surplusIncome = Math.max(0, bankIncomeMonth - totalTargetAmount);
    const isSafe = bankIncomeMonth >= totalTargetAmount;
    const progressBase = totalTargetAmount <= 0 ? 100 : Math.min(100, (bankIncomeMonth / totalTargetAmount) * 100);

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-32 pt-4 md:space-y-6 md:px-8 md:pt-8">
            <section className="app-surface-card rounded-[30px] p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
                            <TargetIcon size={14} />
                            Target Tagihan
                        </div>
                        <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                            Lebih simpel, lebih rapi, dan tetap jelas.
                        </h1>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                            Pantau total target aktif, kebutuhan per bulan, dan bandingkan langsung dengan pemasukan bulan berjalan.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={openAddTargetModal}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                        <Plus size={18} />
                        Tambah Target
                    </button>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[24px] bg-slate-50/90 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Total Target Aktif</p>
                        <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(totalTargetAmount)}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-50/90 px-4 py-4">
                        <div className="flex items-center gap-2 text-blue-600">
                            <Calendar size={16} />
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Kebutuhan / Bulan</p>
                        </div>
                        <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(totalMonthlyNeed)}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-50/90 px-4 py-4">
                        <div className="flex items-center gap-2 text-emerald-600">
                            <ArrowUpRight size={16} />
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pemasukan Bulan Ini</p>
                        </div>
                        <p className="mt-3 text-xl font-black tracking-tight text-slate-950">{formatCurrency(bankIncomeMonth)}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-50/90 px-4 py-4">
                        <div className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${isSafe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isSafe ? 'Aman' : 'Perlu Dikejar'}
                        </div>
                        <p className="mt-3 text-xl font-black tracking-tight text-slate-950">
                            {formatCurrency(isSafe ? surplusIncome : activeRemaining)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                            {isSafe ? 'Surplus dari target aktif' : 'Selisih dari pemasukan bulan ini'}
                        </p>
                    </div>
                </div>

                <div className="mt-5 rounded-[26px] bg-[linear-gradient(135deg,rgba(37,99,235,0.08),rgba(255,255,255,0.92))] px-4 py-4 ring-1 ring-blue-100/80 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Progress Bulan Ini</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                {activeTargets.length} target aktif dengan sisa target {formatCurrency(totalRemainingAmount)}
                            </p>
                        </div>
                        <p className="text-sm font-black text-slate-900">{Math.round(progressBase)}%</p>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/80">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${isSafe ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${progressBase}%` }}
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Daftar Target</h2>
                        <p className="text-sm text-slate-500">Semua target aktif dan riwayat target yang sudah selesai.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">
                        {targets.length} item
                    </span>
                </div>

                <div className="flex flex-col gap-4">
                    {targets.length === 0 && (
                        <div className="app-surface-card rounded-[28px] px-6 py-10 text-center">
                            <p className="text-base font-bold text-slate-800">Belum ada target</p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-500">
                                Tambahkan tagihan rutin seperti listrik, sekolah, arisan, atau kewajiban bulanan lainnya.
                            </p>
                        </div>
                    )}

                    {targets.map((target) => {
                        const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                        const monthsLeft = target.isActive
                            ? Math.max(0, diffInCalendarMonthsInclusive(new Date().toISOString(), target.dueDate) || 0)
                            : 0;
                        const remainingAmount = Math.max(0, target.remainingAmount);
                        const completedAmount = Math.max(0, target.totalAmount - remainingAmount);
                        const progress = target.totalAmount <= 0
                            ? 0
                            : Math.min(100, (completedAmount / target.totalAmount) * 100);
                        const monthlyTarget = target.totalAmount / totalMonths;
                        const dueDateLabel = target.dueDate
                            ? new Date(target.dueDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                            : '-';

                        return (
                            <article key={target.id} className="app-surface-card rounded-[30px] p-5 sm:p-6">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-2xl font-black tracking-tight text-slate-950">{target.title}</h3>
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${target.isActive ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {target.isActive ? 'Aktif' : 'Selesai'}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-500">
                                            {target.isActive ? `${monthsLeft} setoran lagi` : 'Target selesai'}
                                            <span className="px-2 text-slate-300">•</span>
                                            Jatuh tempo {dueDateLabel}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 self-start">
                                        <button
                                            type="button"
                                            onClick={() => openEditTargetModal(target)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                                            title="Edit target"
                                            aria-label="Edit target"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTarget(target.id)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
                                            title="Hapus target"
                                            aria-label="Hapus target"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Nominal Target</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{formatCurrency(target.totalAmount)}</p>
                                    </div>
                                    <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Target / Bulan</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{formatCurrency(monthlyTarget)}</p>
                                    </div>
                                    <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sudah Terpenuhi</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{formatCurrency(completedAmount)}</p>
                                    </div>
                                    <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sisa Target</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{formatCurrency(remainingAmount)}</p>
                                    </div>
                                </div>

                                <div className="mt-5 rounded-[24px] bg-slate-50/80 px-4 py-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Progress Target</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                                {target.isActive
                                                    ? `Target masih berjalan`
                                                    : 'Target sudah selesai'}
                                            </p>
                                        </div>
                                        <p className="text-sm font-black text-slate-900">{Math.round(progress)}%</p>
                                    </div>
                                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${target.isActive ? 'bg-blue-600' : 'bg-emerald-500'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            {isTargetModalOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/65 p-4 backdrop-blur-sm sm:items-center"
                    onMouseDown={closeTargetModal}
                >
                    <div
                        className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)] ring-1 ring-slate-200"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    {editingTargetId ? 'Edit Target' : 'Tambah Target'}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500">
                                    Simpan target dengan nominal dan durasi yang jelas.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeTargetModal}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTarget} className="mt-5 space-y-4">
                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    Nama Target
                                </label>
                                <input
                                    required
                                    placeholder="Contoh: Listrik, Sekolah, Arisan"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={form.title}
                                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    Nominal Target
                                </label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Masukkan total tagihan"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={formatThousands(form.totalAmount)}
                                    onChange={(e) => setForm((prev) => ({ ...prev, totalAmount: sanitizeAmount(e.target.value) }))}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    Jumlah Bulan
                                </label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Contoh: 12"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={formatThousands(form.monthCount)}
                                    onChange={(e) => setForm((prev) => ({ ...prev, monthCount: sanitizeAmount(e.target.value) }))}
                                />
                                <p className="px-1 text-[11px] leading-relaxed text-slate-500">
                                    Durasi dihitung mulai bulan ini sampai jumlah bulan yang Anda tentukan.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Save size={15} />
                                {submitting ? 'Menyimpan...' : editingTargetId ? 'Update Target' : 'Simpan Target'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Targets;
