import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Save, Pencil } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { createTarget, deleteTarget, fetchTargets, markTargetAsTransferred, type TargetItem, updateTarget } from '../services/targets';
import { fetchTransactions, type TransactionItem } from '../services/transactions';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import { useSecurity } from '../context/SecurityContext';

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

const isSameCalendarMonth = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const Targets = () => {
    const { verifySecurity } = useSecurity();
    const [data, setData] = useState<any>({ accounts: [], owners: [] });
    const [targets, setTargets] = useState<TargetItem[]>([]);
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [markingTargetId, setMarkingTargetId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', totalAmount: '', monthCount: '' });

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

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('id-ID', {
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
        if (!form.title.trim()) { alert('Nama target wajib diisi'); return; }
        if (!form.totalAmount || Number(form.totalAmount) <= 0) { alert('Nominal target harus lebih dari 0'); return; }
        if (!form.monthCount || Number(form.monthCount) <= 0) { alert('Jumlah bulan harus lebih dari 0'); return; }

        setSubmitting(true);
        try {
            const payload = {
                title: form.title.trim(),
                totalAmount: Number(form.totalAmount),
                monthCount: Number(form.monthCount),
                ownerId: data.owners[0]?.id || undefined
            };
            if (editingTargetId) {
                await updateTarget(editingTargetId, payload);
            } else {
                await createTarget(payload);
            }
            resetTargetForm();
            await refetchTargets();
            setIsTargetModalOpen(false);
        } catch (error) {
            alert(getErrorMessage(error, 'Gagal menyimpan target'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTarget = async (id: string) => {
        if (!window.confirm('Hapus target ini?')) return;
        const authorized = await verifySecurity('Hapus Target');
        if (!authorized) return;
        try {
            await deleteTarget(id);
            await refetchTargets();
        } catch (error) {
            alert(getErrorMessage(error, 'Gagal menghapus target'));
        }
    };

    const handleMarkTargetTransferred = async (target: TargetItem) => {
        if (!target.isActive) return;

        setMarkingTargetId(target.id);
        try {
            const result = await markTargetAsTransferred(target.id);
            await refetchTargets();
            alert(`Setoran target dicatat sebesar ${formatCurrency(result.appliedAmount)}.`);
        } catch (error) {
            alert(getErrorMessage(error, 'Gagal menandai setoran target'));
        } finally {
            setMarkingTargetId(null);
        }
    };

    if (loading) return <Spinner message="Menganalisis Likuiditas..." />;

    const activeTargets = targets.filter(t => t.isActive);
    const totalTargetAmount = activeTargets.reduce((sum, t) => sum + t.totalAmount, 0);
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
    const progressBase = totalTargetAmount <= 0 ? 100 : Math.min(100, (bankIncomeMonth / totalTargetAmount) * 100);
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold italic text-slate-900">Manajemen Likuiditas</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Target bulanan / tahunan + pengurangan otomatis</p>
            </header>

            <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Budget Alert Bulan Ini</p>
                        <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">Ringkasan Likuiditas</h2>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${isSafe ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {isSafe ? 'Aman' : 'Kurang'}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Pendapatan</p>
                        <p className="mt-2 text-[17px] font-bold tracking-tight text-emerald-600 sm:text-[18px]">{formatCurrency(bankIncomeMonth)}</p>
                    </div>
                    <div className="rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Target Aktif</p>
                        <p className="mt-2 text-[17px] font-bold tracking-tight text-slate-950 sm:text-[18px]">{formatCurrency(totalTargetAmount)}</p>
                    </div>
                    <div className="rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                            {isSafe ? 'Kelebihan Dana' : 'Sisa Kebutuhan'}
                        </p>
                        <p className={`mt-2 text-[17px] font-bold tracking-tight sm:text-[18px] ${isSafe ? 'text-sky-600' : 'text-rose-600'}`}>
                            {formatCurrency(isSafe ? surplusIncome : activeRemaining)}
                        </p>
                    </div>
                    <div className="rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Progress</p>
                        <p className="mt-2 text-[17px] font-bold tracking-tight text-amber-600 sm:text-[18px]">{Math.round(progressBase)}%</p>
                    </div>
                </div>
            </div>

            <section className="space-y-4">
                <div className="app-section-header rounded-2xl px-4 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-600">
                    <h3>Target Tagihan</h3>
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <span className="text-[11px] sm:text-xs">Total target aktif: {formatCurrency(totalTargetAmount)}</span>
                        <button
                            type="button"
                            onClick={openAddTargetModal}
                            className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center"
                            aria-label="Tambah target"
                            title="Tambah target"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                {targets.length === 0 && (
                    <div className="rounded-[30px] border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                        Belum ada target. Tambahkan daftar tagihan bulanan atau tahunan seperti arisan, sekolah, dan kewajiban rutin lainnya.
                    </div>
                )}

                <div className="space-y-4">
                {targets.map((target) => {
                    const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                    const monthsLeft = target.isActive
                        ? Math.max(0, diffInCalendarMonthsInclusive(startOfCurrentMonth.toISOString(), target.dueDate) || 0)
                        : 0;
                    const suggestedContribution = Math.max(0, Math.min(
                        target.remainingAmount,
                        Math.ceil(target.totalAmount / totalMonths)
                    ));
                    const paidAmount = Math.max(0, target.totalAmount - target.remainingAmount);
                    const progressPercent = target.totalAmount <= 0 ? 100 : Math.min(100, (paidAmount / target.totalAmount) * 100);
                    const lastContributionAt = target.lastContributionAt ? new Date(target.lastContributionAt) : null;
                    const alreadyMarkedThisMonth = Boolean(
                        lastContributionAt && isSameCalendarMonth(lastContributionAt, now)
                    );
                    const isTransferButtonDisabled = !target.isActive || alreadyMarkedThisMonth || markingTargetId === target.id;
                    const transferButtonLabel = markingTargetId === target.id
                        ? 'Memproses...'
                        : !target.isActive
                            ? 'Target Selesai'
                            : alreadyMarkedThisMonth
                                ? 'Sudah TF Bulan Ini'
                                : 'Tandai Sudah TF';
                    const remainingTimeLabel = target.isActive ? `${monthsLeft} bulan lagi` : 'Selesai';
                    const remainingTargetLabel = target.remainingAmount > 0 ? formatCurrency(target.remainingAmount) : 'Lunas';
                    const recommendationLabel = suggestedContribution > 0 ? formatCurrency(suggestedContribution) : 'Tidak ada setoran';

                    return (
                        <div
                            key={target.id}
                            className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h4 className="text-[20px] font-bold tracking-tight text-slate-950 sm:text-[22px]">
                                            {target.title}
                                        </h4>
                                        <span
                                            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                                                target.isActive
                                                    ? 'bg-blue-50 text-blue-600'
                                                    : 'bg-emerald-50 text-emerald-600'
                                            }`}
                                        >
                                            {target.isActive ? 'AKTIF' : 'SELESAI'}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                        {totalMonths} BULAN
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => openEditTargetModal(target)}
                                        className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-blue-50 text-blue-500 transition-colors hover:bg-blue-100 hover:text-blue-600"
                                        title="Edit"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTarget(target.id)}
                                        className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-600"
                                        title="Hapus"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                        Nominal<br/>Tagihan
                                    </p>
                                    <p className="mt-3 text-[16px] font-bold tracking-tight text-slate-950 sm:text-[17px]">
                                        {formatCurrency(target.totalAmount)}
                                    </p>
                                </div>
                                <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                        Sisa Waktu
                                    </p>
                                    <p className="mt-3 text-[16px] font-bold tracking-tight text-slate-950 sm:text-[17px]">
                                        {remainingTimeLabel}
                                    </p>
                                </div>
                                <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                        Sudah<br/>Terkumpul
                                    </p>
                                    <p className="mt-3 text-[16px] font-bold tracking-tight text-emerald-600 sm:text-[17px]">
                                        {formatCurrency(paidAmount)}
                                    </p>
                                </div>
                                <div className="rounded-[24px] bg-slate-50 px-5 py-5">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                                        Sisa Target
                                    </p>
                                    <p className={`mt-3 text-[16px] font-bold tracking-tight sm:text-[17px] ${target.remainingAmount > 0 ? 'text-rose-600' : 'text-slate-950'}`}>
                                        {remainingTargetLabel}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 rounded-[24px] bg-slate-50 p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Setoran Bulanan</p>
                                    <span className="text-[10px] font-bold tracking-widest text-slate-500">
                                        {Math.round(progressPercent)}%
                                    </span>
                                </div>
                                <p className="mt-1 text-[17px] font-bold tracking-tight text-slate-950 sm:text-[18px]">
                                    {recommendationLabel}
                                </p>

                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-500 transition-all"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>

                                <div className="mt-5">
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                        {!target.isActive
                                            ? 'Target ini sudah lunas, jadi tidak perlu setoran tambahan.'
                                            : alreadyMarkedThisMonth
                                                ? 'Setoran bulan ini sudah ditandai. Tombol akan aktif lagi di bulan berikutnya.'
                                                : `Tombol ini mengurangi sisa target sebesar cicilan rekomendasi untuk periode berjalan.`}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleMarkTargetTransferred(target)}
                                        disabled={isTransferButtonDisabled}
                                        className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[16px] bg-slate-900 px-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                                    >
                                        {transferButtonLabel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                </div>
            </section>

            {/* ─── Add / Edit Modal (unchanged) ─── */}
            {isTargetModalOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
                    onMouseDown={closeTargetModal}
                >
                    <div
                        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900">{editingTargetId ? 'Edit Target' : 'Tambah Target'}</h3>
                            <button
                                type="button"
                                onClick={closeTargetModal}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTarget} className="mt-4 space-y-3">
                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Nama Target</label>
                                <input
                                    required
                                    placeholder="Contoh: Listrik, Sekolah, Arisan"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={formatThousands(form.monthCount)}
                                    onChange={(e) => setForm((f) => ({ ...f, monthCount: sanitizeAmount(e.target.value) }))}
                                />
                                <p className="px-1 text-[11px] text-slate-400">Dihitung mulai bulan ini hingga jumlah bulan yang ditentukan.</p>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
