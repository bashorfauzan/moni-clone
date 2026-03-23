import { useState, useEffect } from 'react';
import api from '../services/api';
import { Wallet, Plus, Trash2, X, Save, Pencil } from 'lucide-react';
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
        fetchData();
    }, []);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(val);
    };

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

    const openEditTargetModal = (target: any) => {
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

    const totalTargetAmount = targets
        .filter((target) => target.isActive)
        .reduce((sum, target) => sum + target.totalAmount, 0);
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

    return (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold italic text-slate-900">Manajemen Likuiditas</h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Target bulanan / tahunan + pengurangan otomatis</p>
            </header>

            {/* Obligation Status Card */}
            <div className={`rounded-[28px] md:rounded-[32px] p-5 md:p-8 shadow-2xl relative overflow-hidden border transition-all duration-500 ${isSafe ? 'app-hero-card' : 'bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),linear-gradient(135deg,#ff174f_0%,#e63b2e_58%,#cf3f13_100%)] border-rose-300/70'}`}>
                <div className="relative z-10 space-y-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 text-white/90">
                            <Wallet size={18} />
                            <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-white">Budget Alert Bulan Ini</span>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${isSafe ? 'bg-white/18 text-white' : 'bg-black/15 text-white'}`}>
                            {isSafe ? 'Aman' : 'Warning'}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1.25fr_0.95fr] gap-4 items-end">
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/75">Pendapatan Bank Bulan Ini</p>
                            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white break-words">{formatCurrency(bankIncomeMonth)}</h2>
                        </div>
                        <div className={`rounded-3xl border p-4 backdrop-blur-sm ${isSafe ? 'app-hero-panel' : 'border-white/15 bg-black/10'}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                                {isSafe ? 'Kelebihan Dana' : 'Masih Kurang'}
                            </p>
                            <p className="mt-2 text-2xl font-black text-white">
                                {formatCurrency(isSafe ? surplusIncome : activeRemaining)}
                            </p>
                            <p className="mt-2 text-[11px] font-semibold text-white/80">
                                {isSafe ? 'Target tagihan bulan ini sudah tertutup.' : 'Tambahan dana masih dibutuhkan untuk menutup tagihan aktif.'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-black/10 border border-white/10 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Total Target</p>
                            <p className="mt-1 text-lg font-extrabold text-white">{formatCurrency(totalTargetAmount)}</p>
                        </div>
                        <div className="rounded-2xl bg-black/10 border border-white/10 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Sisa Tagihan</p>
                            <p className="mt-1 text-lg font-extrabold text-white">{formatCurrency(activeRemaining)}</p>
                        </div>
                        <div className="rounded-2xl bg-black/10 border border-white/10 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Status</p>
                            <p className="mt-1 text-lg font-extrabold text-white">{isSafe ? 'Target Aman' : 'Belum Tercapai'}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold text-white uppercase tracking-[0.16em]">
                            <span>Progress Penutupan Tagihan</span>
                            <span>{Math.round(progressBase)}%</span>
                        </div>
                        <div className="w-full bg-black/15 h-3 rounded-full overflow-hidden p-[2px]">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${isSafe ? 'bg-white shadow-[0_0_24px_rgba(255,255,255,0.9)]' : 'bg-amber-200 shadow-[0_0_20px_rgba(253,230,138,0.7)]'}`}
                                style={{ width: `${progressBase}%` }}
                            />
                        </div>
                    </div>
                </div>
                <div className="absolute -right-14 -top-14 w-56 h-56 bg-white/15 rounded-full blur-3xl"></div>
                <div className="absolute -left-10 -bottom-16 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>
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
                            const monthsLeft = diffInCalendarMonthsInclusive(new Date().toISOString(), target.dueDate) || 0;

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
                                            <button onClick={() => openEditTargetModal(target)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl transition-colors">
                                                <Pencil size={15} />
                                            </button>
                                            <button onClick={() => handleDeleteTarget(target.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                                        <p className="font-medium text-slate-600">Nominal Tagihan: <span className="font-bold text-slate-900">{formatCurrency(target.totalAmount)}</span></p>
                                        <p className="font-medium text-slate-600">{target.isActive ? `${Math.max(0, monthsLeft)} bulan lagi` : 'Selesai'}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {isTargetModalOpen && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={closeTargetModal}>
                    <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-5 space-y-4" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">{editingTargetId ? 'Edit Target' : 'Tambah Target'}</h3>
                            <button onClick={closeTargetModal} className="p-2 text-slate-500"><X size={16} /></button>
                        </div>

                        <form onSubmit={handleSaveTarget} className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Nama Target</label>
                                <input
                                    required
                                    placeholder="Contoh: Arisan, Sekolah, Operasional"
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm"
                                    value={form.title}
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Nominal Target</label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Masukkan total tagihan"
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm"
                                    value={formatThousands(form.totalAmount)}
                                    onChange={(e) => setForm((f) => ({ ...f, totalAmount: sanitizeAmount(e.target.value) }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Jumlah Bulan</label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Contoh: 10"
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm"
                                    value={formatThousands(form.monthCount)}
                                    onChange={(e) => setForm((f) => ({ ...f, monthCount: sanitizeAmount(e.target.value) }))}
                                />
                                <p className="px-1 text-[11px] text-slate-500">
                                    Dihitung dari bulan ini sampai jumlah bulan yang Anda tentukan.
                                </p>
                            </div>

                            <button
                                disabled={submitting}
                                className="w-full h-11 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                <Save size={14} />
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
