import { useState, useEffect } from 'react';
import api from '../services/api';
import { Plus, Trash2, X, Save, Pencil } from 'lucide-react';
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
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
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
        } catch (error) {
            console.error(error);
            alert('Gagal menghapus target');
        }
    };

    if (loading) return <Spinner message="Menganalisis Likuiditas..." />;

    const activeTargets = targets.filter((target) => target.isActive);
    const totalTargetAmount = activeTargets.reduce((sum, target) => sum + target.totalAmount, 0);
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
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

    return (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-32 pt-4 md:space-y-6 md:px-8 md:pt-8">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Target Tagihan</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                        Kelola tagihan aktif dengan tampilan yang lebih ringan dan mudah dibaca.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={openAddTargetModal}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition-colors hover:bg-slate-800"
                    aria-label="Tambah target"
                    title="Tambah target"
                >
                    <Plus size={18} />
                </button>
            </header>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="app-surface-card rounded-[24px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Total Target Aktif</p>
                    <p className="mt-2 text-xl font-black tracking-tight text-slate-950">{formatCurrency(totalTargetAmount)}</p>
                </div>
                <div className="app-surface-card rounded-[24px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pemasukan Bulan Ini</p>
                    <p className="mt-2 text-xl font-black tracking-tight text-slate-950">{formatCurrency(bankIncomeMonth)}</p>
                </div>
                <div className="app-surface-card rounded-[24px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        {isSafe ? 'Surplus' : 'Kebutuhan'}
                    </p>
                    <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
                        {formatCurrency(isSafe ? surplusIncome : activeRemaining)}
                    </p>
                </div>
                <div className="app-surface-card rounded-[24px] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</p>
                    <p className={`mt-2 text-xl font-black tracking-tight ${isSafe ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isSafe ? 'Aman' : 'Perlu Dikejar'}
                    </p>
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Daftar Target</h2>
                        <p className="text-sm text-slate-500">Tampilan lebih ringkas untuk semua tagihan aktif.</p>
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
                                Tambahkan tagihan bulanan atau tahunan agar mudah dipantau dari sini.
                            </p>
                        </div>
                    )}

                    {targets.map((target) => {
                        const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                        const monthsLeft = target.isActive
                            ? Math.max(0, diffInCalendarMonthsInclusive(new Date().toISOString(), target.dueDate) || 0)
                            : 0;

                        return (
                            <article key={target.id} className="app-surface-card rounded-[30px] p-5 sm:p-6">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{target.title}</h3>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${target.isActive ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                {target.isActive ? 'Aktif' : 'Selesai'}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                            {totalMonths} bulan
                                            <span className="px-2">•</span>
                                            {target.isActive ? `${monthsLeft} setoran lagi` : 'selesai'}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 self-start">
                                        <button
                                            type="button"
                                            onClick={() => openEditTargetModal(target)}
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                                            title="Edit"
                                            aria-label="Edit"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTarget(target.id)}
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
                                            title="Hapus"
                                            aria-label="Hapus"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Nominal Tagihan</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">{formatCurrency(target.totalAmount)}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50/80 px-4 py-3">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sisa Waktu</p>
                                        <p className="mt-2 text-lg font-black tracking-tight text-slate-950">
                                            {target.isActive ? `${monthsLeft} bulan lagi` : 'Selesai'}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            {isTargetModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center" onMouseDown={closeTargetModal}>
                    <div className="w-full max-w-md rounded-[28px] bg-white p-5 ring-1 ring-slate-200" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{editingTargetId ? 'Edit Target' : 'Tambah Target'}</h3>
                                <p className="mt-1 text-sm text-slate-500">Isi data target dengan lebih singkat dan jelas.</p>
                            </div>
                            <button type="button" onClick={closeTargetModal} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTarget} className="mt-5 space-y-4">
                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Nama Target</label>
                                <input
                                    required
                                    placeholder="Contoh: Listrik, Sekolah, Operasional"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Nominal Target</label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Masukkan total tagihan"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={formatThousands(form.totalAmount)}
                                    onChange={(e) => setForm((f) => ({ ...f, totalAmount: sanitizeAmount(e.target.value) }))}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Jumlah Bulan</label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Contoh: 12"
                                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={formatThousands(form.monthCount)}
                                    onChange={(e) => setForm((f) => ({ ...f, monthCount: sanitizeAmount(e.target.value) }))}
                                />
                                <p className="px-1 text-[11px] text-slate-500">
                                    Dihitung mulai bulan ini hingga jumlah bulan yang Anda tentukan.
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
