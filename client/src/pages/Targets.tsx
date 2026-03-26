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
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const bankIncomeMonth = transactions
        .filter(tx => {
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
        <div className="mx-auto w-full max-w-4xl px-5 pb-32 pt-6 space-y-6">

            {/* ─── Header ─── */}
            <header className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">Target Tagihan</h1>
                    <p className="mt-1 text-sm text-slate-500">Pantau kewajiban bulanan dan tahunan.</p>
                </div>
                <button
                    type="button"
                    onClick={openAddTargetModal}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white transition-colors hover:bg-blue-700 shadow-md shadow-blue-200"
                    aria-label="Tambah target"
                >
                    <Plus size={20} />
                </button>
            </header>

            {/* ─── Stats Cards ─── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'TOTAL TARGET AKTIF', value: formatCurrency(totalTargetAmount), color: 'text-slate-900', labelClass: 'w-full uppercase' },
                    { label: 'PEMASUKAN BULAN\nINI', value: formatCurrency(bankIncomeMonth), color: 'text-slate-900', labelClass: 'whitespace-pre-wrap leading-tight uppercase' },
                    { label: 'SURPLUS', value: formatCurrency(isSafe ? surplusIncome : activeRemaining), color: 'text-slate-900', labelClass: 'uppercase' },
                    { label: 'STATUS', value: isSafe ? 'Aman' : 'Perlu Dikejar', color: isSafe ? 'text-emerald-600' : 'text-amber-600', labelClass: 'uppercase', noFormat: true },
                ].map((stat, i) => (
                    <div key={i} className="rounded-3xl bg-white border border-slate-100 shadow-sm px-5 py-4 flex flex-col justify-center min-h-[5rem]">
                        <p className={`text-[10px] font-extrabold tracking-[0.18em] text-slate-400 ${stat.labelClass}`}>{stat.label}</p>
                        <p className={`mt-2 text-[15px] font-black tracking-tight break-all ${stat.color}`}>
                            {stat.noFormat ? stat.value : stat.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* ─── Targets List Container ─── */}
            <div className="rounded-[2rem] bg-white border border-slate-100 p-6 shadow-sm flex flex-col">
                {targets.length === 0 && (
                    <div className="text-center py-6">
                        <p className="text-sm font-bold text-slate-700">Belum ada target</p>
                        <p className="mt-1 text-sm text-slate-500">Tambahkan tagihan bulanan atau tahunan.</p>
                    </div>
                )}

                {targets.map((target, index) => {
                    const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
                    const monthsLeft = target.isActive
                        ? Math.max(0, diffInCalendarMonthsInclusive(now.toISOString(), target.dueDate) || 0)
                        : 0;
                    
                    const isLast = index === targets.length - 1;

                    return (
                        <div key={target.id} className={`flex flex-col relative py-6 ${!isLast ? 'border-b border-slate-100/60' : ''} ${index === 0 ? 'pt-0' : ''} ${isLast ? 'pb-0' : ''}`}>
                            <div className="pr-16">
                                <h3 className="text-[17px] font-bold text-slate-900">{target.title}</h3>
                                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                                    {totalMonths} BULAN
                                    <span className="mx-1.5">•</span>
                                    {monthsLeft} SETORAN LAGI
                                    <span className="mx-1.5">•</span>
                                    <span className={target.isActive ? 'text-blue-500' : 'text-emerald-500'}>{target.isActive ? 'AKTIF' : 'SELESAI'}</span>
                                </p>
                            </div>

                            <div className="absolute top-6 right-0 flex items-center gap-3">
                                <button
                                    onClick={() => openEditTargetModal(target)}
                                    className="text-blue-400 hover:text-blue-600 transition-colors"
                                    title="Edit"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    onClick={() => handleDeleteTarget(target.id)}
                                    className="text-rose-400 hover:text-rose-600 transition-colors"
                                    title="Hapus"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="mt-8 space-y-1.5 text-sm">
                                <p className="text-slate-500">Nominal Tagihan: <span className="font-bold text-slate-900">{formatCurrency(target.totalAmount)}</span></p>
                                <p className="text-slate-500">{monthsLeft} bulan lagi</p>
                            </div>
                        </div>
                    );
                })}
            </div>

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
