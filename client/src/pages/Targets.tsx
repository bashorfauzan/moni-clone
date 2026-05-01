import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Save, Pencil } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { createTarget, deleteTarget, fetchTargets, markTargetAsTransferred, type TargetItem, updateTarget } from '../services/targets';
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
    const [submitting, setSubmitting] = useState(false);
    const [markingTargetId, setMarkingTargetId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', totalAmount: '', monthCount: '' });

    const loadPageData = async () => {
        const [metaRes, targetRes] = await Promise.all([
            fetchMasterMeta(),
            fetchTargets()
        ]);
        setData({ accounts: metaRes.accounts, owners: metaRes.owners });
        setTargets(targetRes.targets || []);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                await loadPageData();
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
            setTargets((currentTargets) => currentTargets.map((item) => (
                item.id === target.id ? result.target : item
            )));

            void refetchTargets();
        } catch (error) {
            alert(getErrorMessage(error, 'Gagal menandai setoran target'));
        } finally {
            setMarkingTargetId(null);
        }
    };

    if (loading) return <Spinner message="Menganalisis Likuiditas..." />;

    const activeTargets = targets.filter(t => t.isActive);
    const now = new Date();
    const isMarkedThisMonth = (target: TargetItem) => {
        if (!target.lastContributionAt) return false;
        return isSameCalendarMonth(new Date(target.lastContributionAt), now);
    };
    const monthlyWorkflowTargets = targets.filter((target) => target.isActive || isMarkedThisMonth(target));
    const monthlyTargetAmount = monthlyWorkflowTargets.reduce((sum, target) => sum + target.totalAmount, 0);
    const transferredThisMonth = monthlyWorkflowTargets
        .filter((target) => isMarkedThisMonth(target))
        .reduce((sum, target) => sum + target.totalAmount, 0);
    const remainingThisMonth = Math.max(0, monthlyTargetAmount - transferredThisMonth);
    const surplusThisMonth = Math.max(0, transferredThisMonth - monthlyTargetAmount);
    const isSafe = monthlyTargetAmount > 0 && remainingThisMonth === 0;
    const progressBase = monthlyTargetAmount <= 0 ? 100 : Math.min(100, (transferredThisMonth / monthlyTargetAmount) * 100);

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold italic text-slate-900">Manajemen Likuiditas</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Target bulanan / tahunan + pengurangan otomatis</p>
            </header>

            <div className="app-hero-card rounded-[32px] p-5 relative overflow-hidden shadow-xl shadow-blue-900/5 border border-white/20">
                <div className="absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-20 -mt-20" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.25 }}></div>
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.15 }}></div>
                <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3 mb-6">
                        <div className="flex flex-col gap-3 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Budget Bulan Ini</p>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={openAddTargetModal}
                                    className="h-10 w-10 shrink-0 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:bg-blue-400 transition-transform active:scale-95"
                                    aria-label="Tambah target"
                                    title="Tambah target"
                                >
                                    <Plus size={20} />
                                </button>
                                <h2 className="text-base sm:text-lg font-bold text-white truncate">Ringkasan Likuiditas</h2>
                            </div>
                        </div>
                        <div className={`mt-0.5 shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${isSafe ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' : 'bg-rose-400/20 text-rose-300 border border-rose-400/30'}`}>
                            {isSafe ? 'Aman' : 'Kurang'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Sudah TF</p>
                            <p className="mt-1 text-sm font-bold text-emerald-300">{formatCurrency(transferredThisMonth)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Tagihan</p>
                            <p className="mt-1 text-sm font-bold text-white">{formatCurrency(monthlyTargetAmount)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                                {isSafe ? 'Kelebihan Dana' : 'Sisa Kebutuhan'}
                            </p>
                            <p className={`mt-1 text-sm font-bold ${isSafe ? 'text-sky-300' : 'text-rose-300'}`}>
                                {formatCurrency(isSafe ? surplusThisMonth : remainingThisMonth)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Progress</p>
                            <p className="mt-1 text-sm font-bold text-amber-300">{Math.round(progressBase)}%</p>
                        </div>
                    </div>
                </div>
            </div>

            <section className="space-y-4">

                {targets.length === 0 && (
                    <div className="rounded-[30px] border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                        Belum ada target. Tambahkan daftar tagihan bulanan atau tahunan seperti arisan, sekolah, dan kewajiban rutin lainnya.
                    </div>
                )}

                <div className="space-y-4">
                    {targets.map((target) => {
                        const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                        const monthsLeft = Math.max(0, target.remainingMonths);
                        const paidAmount = Math.max(0, (totalMonths - monthsLeft) * target.totalAmount);
                        const progressPercent = totalMonths <= 0 ? 100 : Math.min(100, ((totalMonths - monthsLeft) / totalMonths) * 100);
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
                        const remainingTargetLabel = formatCurrency(target.remainingAmount);

                        return (
                            <div
                                key={target.id}
                                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex flex-col gap-3"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-bold text-slate-900 truncate">
                                                {target.title}
                                            </h4>
                                            {!target.isActive && (
                                                <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-600">
                                                    Selesai
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 truncate">
                                            {formatCurrency(target.totalAmount)} / bln <span className="text-slate-300 mx-1">•</span> {monthsLeft} bln tersisa
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                                        <button
                                            onClick={() => openEditTargetModal(target)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteTarget(target.id)}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Hapus"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-xl p-3">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Terkumpul</p>
                                        <p className="mt-0.5 text-sm font-bold text-emerald-600 truncate">{formatCurrency(paidAmount)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Sisa Target</p>
                                        <p className={`mt-0.5 text-sm font-bold truncate ${target.remainingAmount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                            {remainingTargetLabel}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <p className="text-[10px] font-semibold text-slate-500">Progress</p>
                                        <p className="text-[10px] font-bold text-slate-700">{Math.round(progressPercent)}%</p>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 mb-3">
                                        <div
                                            className="h-full bg-gradient-to-r from-teal-400 to-sky-500"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => void handleMarkTargetTransferred(target)}
                                        disabled={isTransferButtonDisabled}
                                        className="h-9 w-full rounded-xl bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {transferButtonLabel}
                                    </button>
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
