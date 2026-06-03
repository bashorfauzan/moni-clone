import { useState, useEffect } from 'react';
import { Plus, Trash2, X, Save, Pencil, Download } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { createTarget, deleteTarget, fetchTargets, markTargetAsTransferred, type TargetItem, updateTarget } from '../services/targets';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import { useSecurity } from '../context/SecurityContext';
import { announceSuccess } from '../lib/feedback';
import { formatCurrency, formatThousands, sanitizeAmount } from '../lib/format';
import { downloadBackupBlob } from '../services/backup';

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

const currentMonthInputValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const Targets = () => {
    const { verifySecurity } = useSecurity();
    const [data, setData] = useState<any>({ accounts: [], owners: [] });
    const [targets, setTargets] = useState<TargetItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [markingTargetId, setMarkingTargetId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [form, setForm] = useState({
        title: '',
        notes: '',
        kind: 'SAVING' as 'SAVING' | 'BILL',
        sourceAccountId: '',
        destinationAccountId: '',
        totalAmount: '',
        monthCount: '',
        startMonth: currentMonthInputValue()
    });

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

    const refetchTargets = async () => {
        const targetRes = await fetchTargets();
        setTargets(targetRes.targets || []);
    };

    const resetTargetForm = () => {
        setForm({
            title: '',
            notes: '',
            kind: 'SAVING',
            sourceAccountId: '',
            destinationAccountId: '',
            totalAmount: '',
            monthCount: '',
            startMonth: currentMonthInputValue()
        });
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
            notes: target.notes || '',
            kind: target.kind || 'SAVING',
            sourceAccountId: target.sourceAccountId || '',
            destinationAccountId: target.destinationAccountId || '',
            totalAmount: String(target.totalAmount || ''),
            monthCount: String(diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 12),
            startMonth: target.createdAt ? String(target.createdAt).slice(0, 7) : currentMonthInputValue(),
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
        if (!form.startMonth) { alert('Bulan mulai wajib dipilih'); return; }
        setSubmitting(true);
        try {
            const payload = {
                title: form.title.trim(),
                notes: form.notes.trim(),
                kind: form.kind,
                sourceAccountId: form.kind === 'SAVING' ? form.sourceAccountId || undefined : undefined,
                destinationAccountId: form.kind === 'SAVING' ? form.destinationAccountId || undefined : undefined,
                totalAmount: Number(form.totalAmount),
                monthCount: Number(form.monthCount),
                startMonth: form.startMonth,
                ownerId: data.owners[0]?.id || undefined
            };
            if (editingTargetId) {
                await updateTarget(editingTargetId, payload);
            } else {
                await createTarget(payload);
            }
            announceSuccess(editingTargetId ? 'Target berhasil diperbarui.' : 'Target berhasil ditambahkan.');
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

    const handleExportTargets = async () => {
        setExporting(true);
        try {
            const XLSX = await import('xlsx');
            const rows = targets.map((target) => {
                const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                const monthsLeft = Math.max(0, target.remainingMonths);
                const totalTargetAmount = totalMonths * target.totalAmount;
                const paidAmount = Math.max(0, totalTargetAmount - target.remainingAmount);
                const paidMonths = target.totalAmount > 0
                    ? Math.max(0, Math.min(totalMonths, Math.round(paidAmount / target.totalAmount)))
                    : 0;
                const progressPercent = totalTargetAmount <= 0 ? 100 : Math.min(100, (paidAmount / totalTargetAmount) * 100);
                const startMonthLabel = target.createdAt
                    ? new Date(target.createdAt).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                    : '-';

                return {
                    Target: target.title,
                    Catatan: target.notes || '-',
                    Jenis: target.kind === 'BILL' ? 'Tagihan' : 'Tabungan',
                    'Rekening Asal': target.sourceAccountId ? data.accounts.find((account: any) => account.id === target.sourceAccountId)?.name || '-' : '-',
                    'Rekening Tujuan': target.destinationAccountId ? data.accounts.find((account: any) => account.id === target.destinationAccountId)?.name || '-' : '-',
                    Pemilik: target.owner?.name || data.owners.find((owner: any) => owner.id === target.ownerId)?.name || '-',
                    'Mulai Bulan': startMonthLabel,
                    'Nominal Bulanan (Rp)': target.totalAmount,
                    'Total Bulan': totalMonths,
                    'Bulan Terbayar': paidMonths,
                    'Bulan Sisa': monthsLeft,
                    'Sudah Dibayar (Rp)': paidAmount,
                    'Sisa Kewajiban (Rp)': target.remainingAmount,
                    Progress: `${Math.round(progressPercent)}%`,
                    Status: target.isActive ? 'Aktif' : 'Selesai',
                    'Terakhir Ditandai': target.lastContributionAt
                        ? new Date(target.lastContributionAt).toLocaleDateString('id-ID')
                        : '-',
                    'Dibuat': target.createdAt
                        ? new Date(target.createdAt).toLocaleDateString('id-ID')
                        : '-',
                    'Jatuh Tempo': target.dueDate
                        ? new Date(target.dueDate).toLocaleDateString('id-ID')
                        : '-'
                };
            });

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Target Likuiditas');
            const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
            const blob = new Blob([output], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadBackupBlob(blob, `Target Likuiditas ${dateStr}.xlsx`);
            announceSuccess('Export target berhasil dibuat.');
        } catch (error) {
            alert(getErrorMessage(error, 'Gagal export target ke Excel'));
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <Spinner message="Menganalisis Likuiditas..." />;

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
    const activeTargets = targets.filter((target) => target.isActive || target.kind !== 'BILL');
    const archivedBillTargets = targets.filter((target) => !target.isActive && target.kind === 'BILL');

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="flex items-start justify-between gap-3 rounded-[28px] border border-white/30 bg-white/70 px-5 py-4 shadow-sm backdrop-blur-sm">
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold italic text-slate-900">Manajemen Likuiditas</h1>
                        <button
                            type="button"
                            onClick={() => void handleExportTargets()}
                            disabled={exporting || targets.length === 0}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-transform hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
                            aria-label="Export target ke Excel"
                            title="Export target ke Excel"
                        >
                            <Download size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={openAddTargetModal}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-transform hover:bg-blue-400 active:scale-95"
                            aria-label="Tambah target"
                            title="Tambah target"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <p className="mt-1 text-slate-500 text-[10px] font-bold uppercase tracking-wider">Target bulanan / tahunan + pengurangan otomatis</p>
                </div>
            </header>
            <div className="app-hero-card rounded-[32px] p-5 relative overflow-hidden shadow-xl shadow-blue-900/5 border border-white/20">
                <div className="absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-20 -mt-20" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.25 }}></div>
                <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.15 }}></div>
                <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3 mb-6">
                        <div className="flex flex-col gap-3 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Budget Bulan Ini</p>
                            <div className="flex items-center gap-3">
                               
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
                    {activeTargets.map((target) => {
                        const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                        const monthsLeft = Math.max(0, target.remainingMonths);
                        const totalTargetAmount = totalMonths * target.totalAmount;
                        const paidAmount = Math.max(0, totalTargetAmount - target.remainingAmount);
                        const progressPercent = totalTargetAmount <= 0 ? 100 : Math.min(100, (paidAmount / totalTargetAmount) * 100);
                        const lastContributionAt = target.lastContributionAt ? new Date(target.lastContributionAt) : null;
                        const alreadyMarkedThisMonth = Boolean(
                            lastContributionAt && isSameCalendarMonth(lastContributionAt, now)
                        );
                        const isTransferButtonDisabled = !target.isActive || alreadyMarkedThisMonth || markingTargetId === target.id;
                        const sourceAccountName = target.sourceAccountId
                            ? data.accounts.find((account: any) => account.id === target.sourceAccountId)?.name || '-'
                            : '-';
                        const destinationAccountName = target.destinationAccountId
                            ? data.accounts.find((account: any) => account.id === target.destinationAccountId)?.name || '-'
                            : '-';
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
                                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${target.kind === 'BILL' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                                                {target.kind === 'BILL' ? 'Tagihan' : 'Tabungan'}
                                            </span>
                                            {!target.isActive && (
                                                <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-600">
                                                    Selesai
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 truncate">
                                            {formatCurrency(target.totalAmount)} / bln <span className="text-slate-300 mx-1">•</span> {monthsLeft} bln tersisa
                                        </p>
                                        <p className="mt-1 text-[11px] text-slate-400 truncate">
                                            Mulai {target.createdAt ? new Date(target.createdAt).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-'}
                                        </p>
                                        {target.kind === 'SAVING' && (
                                            <p className="mt-1 text-[11px] text-slate-400 truncate">
                                                {sourceAccountName} <span className="mx-1">→</span> {destinationAccountName}
                                            </p>
                                        )}
                                        {target.notes && (
                                            <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
                                                {target.notes}
                                            </p>
                                        )}
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

                {archivedBillTargets.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-bold text-slate-900">Riwayat Tagihan Selesai</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {archivedBillTargets.length} item
                            </span>
                        </div>
                        <div className="space-y-3">
                            {archivedBillTargets.map((target) => {
                                const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                                const totalTargetAmount = totalMonths * target.totalAmount;
                                const paidAmount = Math.max(0, totalTargetAmount - target.remainingAmount);

                                return (
                                    <div
                                        key={`archived-${target.id}`}
                                        className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-bold text-slate-900 truncate">{target.title}</h4>
                                                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                                                        Tagihan
                                                    </span>
                                                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-600">
                                                        Selesai
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500 truncate">
                                                    {formatCurrency(target.totalAmount)} / bln <span className="text-slate-300 mx-1">•</span> lunas
                                                </p>
                                                <p className="mt-1 text-[11px] text-slate-400 truncate">
                                                    Mulai {target.createdAt ? new Date(target.createdAt).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-'}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Terkumpul</p>
                                                <p className="mt-0.5 text-sm font-bold text-emerald-600">{formatCurrency(paidAmount)}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
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
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Jenis</label>
                                <select
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={form.kind}
                                    onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'SAVING' | 'BILL' }))}
                                >
                                    <option value="SAVING">Tabungan</option>
                                    <option value="BILL">Tagihan</option>
                                </select>
                                <p className="px-1 text-[11px] text-slate-400">Tagihan yang sudah lunas akan dipindah ke riwayat agar daftar utama tetap rapi.</p>
                            </div>
                            {form.kind === 'SAVING' && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Rekening Asal</label>
                                        <select
                                            className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                            value={form.sourceAccountId}
                                            onChange={(e) => setForm((f) => ({ ...f, sourceAccountId: e.target.value }))}
                                        >
                                            <option value="">Pilih rekening asal...</option>
                                            {data.accounts.map((account: any) => (
                                                <option key={`source-${account.id}`} value={account.id}>
                                                    {account.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Rekening Tujuan</label>
                                        <select
                                            className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                            value={form.destinationAccountId}
                                            onChange={(e) => setForm((f) => ({ ...f, destinationAccountId: e.target.value }))}
                                        >
                                            <option value="">Pilih rekening tujuan...</option>
                                            {data.accounts.map((account: any) => (
                                                <option key={`destination-${account.id}`} value={account.id}>
                                                    {account.name}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="px-1 text-[11px] text-slate-400">Opsional. Hanya untuk penanda arah tabungan, tidak mengubah saldo rekening saat target ditandai.</p>
                                    </div>
                                </>
                            )}
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
                                <p className="px-1 text-[11px] text-slate-400">Total tenor target dari bulan mulai yang Anda pilih.</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Mulai Bulan</label>
                                <input
                                    required
                                    type="month"
                                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={form.startMonth}
                                    onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
                                />
                                <p className="px-1 text-[11px] text-slate-400">Pilih bulan awal jika target ini sudah berjalan dari tahun lalu atau bulan sebelumnya.</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Catatan</label>
                                <textarea
                                    rows={3}
                                    placeholder="Contoh: dibayar tiap awal bulan, prioritas utama, atau memo lain"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition resize-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                />
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
