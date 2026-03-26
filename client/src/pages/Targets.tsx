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
                await api.put(`/targets/${editingTargetId}`, payload);
            } else {
                await api.post('/targets', payload);
            }
            resetTargetForm();
            await refetchTargets();
            setIsTargetModalOpen(false);
        } catch (error: any) {
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
        } catch {
            alert('Gagal menghapus target');
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

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold italic text-slate-900">Manajemen Likuiditas</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Target bulanan / tahunan + pengurangan otomatis</p>
            </header>

            <div className={`rounded-3xl p-4 mb-6 relative overflow-hidden border transition-all duration-500 ${isSafe ? 'app-hero-card' : 'bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),linear-gradient(135deg,#ff174f_0%,#e63b2e_58%,#cf3f13_100%)] border-rose-300/70'}`}>
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl -mr-16 -mt-16 bg-white/10"></div>
                <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full blur-3xl -ml-14 -mb-14 bg-black/10"></div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Budget Alert Bulan Ini</p>
                        <div className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${isSafe ? 'bg-white/18 text-white' : 'bg-black/15 text-white'}`}>
                            {isSafe ? 'Aman' : 'Warning'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Pendapatan Masuk</p>
                            <p className="mt-1 text-xs font-bold text-white break-all leading-snug">{formatCurrency(bankIncomeMonth)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">
                                {isSafe ? 'Kelebihan Dana' : 'Masih Kurang'}
                            </p>
                            <p className="mt-1 text-xs font-bold text-white break-all leading-snug">
                                {formatCurrency(isSafe ? surplusIncome : activeRemaining)}
                            </p>
                        </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Total Target</p>
                            <p className="mt-1 text-xs font-bold text-white break-all leading-snug">{formatCurrency(totalTargetAmount)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Sisa</p>
                            <p className="mt-1 text-xs font-bold text-emerald-300 break-all leading-snug">{formatCurrency(activeRemaining)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Status</p>
                            <p className="mt-1 text-xs font-bold text-white">{isSafe ? 'Aman' : 'Kurang'}</p>
                        </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold text-white uppercase tracking-[0.14em]">
                            <span>Progress</span>
                            <span>{Math.round(progressBase)}%</span>
                        </div>
                        <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white transition-all duration-1000 ease-out"
                                style={{ width: `${progressBase}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <section className="space-y-4">
                <div className="app-section-header rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-600">
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

                <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden flex flex-col">
                {targets.length === 0 && (
                    <div className="text-sm text-slate-500 p-8 text-center bg-slate-50/50">
                        Belum ada target. Tambahkan daftar tagihan bulanan atau tahunan seperti arisan, sekolah, dan kewajiban rutin lainnya.
                    </div>
                )}

                <div className="divide-y divide-slate-100/60">
                {targets.map((target) => {
                    const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                    const monthsLeft = target.isActive
                        ? Math.max(0, diffInCalendarMonthsInclusive(now.toISOString(), target.dueDate) || 0)
                        : 0;

                    return (
                        <div key={target.id} className="p-5 sm:p-6 space-y-4 hover:bg-slate-50/40 transition-colors">
                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                                <div className="min-w-0">
                                    <h4 className="font-bold text-slate-900 text-base sm:text-lg">{target.title}</h4>
                                    <p className="text-[10px] uppercase text-slate-500 font-bold tracking-widest mt-1">
                                        {totalMonths} Bulan
                                        {target.isActive && ` • ${Math.max(0, monthsLeft)} SETORAN LAGI`}
                                        {' • '}
                                        <span className={target.isActive ? 'text-blue-500' : 'text-emerald-500'}>{target.isActive ? 'Aktif' : 'Selesai'}</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity self-end sm:self-auto">
                                    <button
                                        onClick={() => openEditTargetModal(target)}
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                        title="Edit"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTarget(target.id)}
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                        title="Hapus"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-500">
                                <p>Nominal Tagihan: <span className="font-bold text-slate-900">{formatCurrency(target.totalAmount)}</span></p>
                                <p>{Math.max(0, monthsLeft)} bulan lagi</p>
                            </div>
                        </div>
                    );
                })}
                </div>
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
