import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Save, Trash2, X, Wallet } from 'lucide-react';
import Spinner from '../components/Spinner';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import {
    createIpoOrder,
    deleteIpoOrder,
    fetchIpoOrders,
    fetchIpoTransactions,
    updateIpoOrder,
    type IpoOrder,
    type IpoOrderStatus,
    type IpoTransaction
} from '../services/stocksIpo';

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(value || 0);

const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];
const IPO_STATUS_OPTIONS: IpoOrderStatus[] = ['RENCANA', 'PESAN', 'JATAH', 'TIDAK_JATAH', 'JUAL'];

const emptyForm = () => ({
    ownerId: '',
    accountId: '',
    ticker: '',
    broker: '',
    ipoPrice: '',
    lotRequested: '',
    lotAllocated: '',
    sellPrice: '',
    status: 'RENCANA' as IpoOrderStatus,
    orderedAt: new Date().toISOString().slice(0, 10),
    allottedAt: '',
    soldAt: '',
    notes: ''
});

// Status badge styling map
const STATUS_STYLE: Record<IpoOrderStatus, { badge: string; dot: string; label: string; border: string }> = {
    RENCANA:    { badge: 'bg-violet-50 text-violet-600 border-violet-100', dot: 'bg-violet-500', label: 'Rencana', border: 'border-l-violet-500' },
    PESAN:      { badge: 'bg-blue-50 text-blue-600 border-blue-100',    dot: 'bg-blue-500',    label: 'Pesan',       border: 'border-l-blue-500' },
    JATAH:      { badge: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-500', label: 'Jatah',       border: 'border-l-emerald-500' },
    TIDAK_JATAH:{ badge: 'bg-rose-50 text-rose-500 border-rose-100',    dot: 'bg-rose-500',    label: 'Tidak Jatah', border: 'border-l-rose-400' },
    JUAL:       { badge: 'bg-amber-50 text-amber-600 border-amber-100', dot: 'bg-amber-500',   label: 'Jual',        border: 'border-l-amber-500' },
};

const StocksIpo = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [orders, setOrders] = useState<IpoOrder[]>([]);
    const [transactions, setTransactions] = useState<IpoTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(() => searchParams.get('newOrder') === 'true');
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState<'ALL' | IpoOrderStatus>('ALL');
    const [form, setForm] = useState(emptyForm());

    const stockAccounts = useMemo(
        () => accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type)),
        [accounts]
    );
    const selectedAccount = stockAccounts.find((account) => account.id === form.accountId) || null;
    const selectedOwner = owners.find((owner) => owner.id === (selectedAccount?.ownerId || form.ownerId)) || null;
    const isPlanStage = form.status === 'RENCANA';
    const isReservationStage = form.status === 'PESAN';
    const needsAllocationFields = form.status === 'JATAH' || form.status === 'JUAL';
    const needsSellFields = form.status === 'JUAL';

    const loadData = async () => {
        try {
            const meta = await fetchMasterMeta();
            const nextAccounts = meta.accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type));
            setOwners(meta.owners);
            setAccounts(meta.accounts);

            const filter = {
                ownerId: selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined,
                status: selectedStatus !== 'ALL' ? selectedStatus : undefined
            };

            const [orderRows, txRows] = await Promise.all([
                fetchIpoOrders(filter),
                fetchIpoTransactions({
                    ownerId: selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined
                })
            ]);

            setOrders(orderRows);
            setTransactions(txRows);
            setForm((current) => ({
                ...current,
                accountId: current.accountId || nextAccounts[0]?.id || '',
                ownerId: current.ownerId || nextAccounts[0]?.ownerId || meta.owners[0]?.id || ''
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [selectedOwnerId, selectedStatus]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            ...emptyForm(),
            ownerId: stockAccounts[0]?.ownerId || owners[0]?.id || '',
            accountId: stockAccounts[0]?.id || ''
        });
        setIsFormOpen(false);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);

        try {
            const payload = {
                ownerId: form.ownerId,
                accountId: form.accountId,
                ticker: form.ticker.trim().toUpperCase(),
                broker: form.broker.trim(),
                ipoPrice: Number(form.ipoPrice),
                lotRequested: Number(form.lotRequested),
                lotAllocated: Number(form.lotAllocated || 0),
                sellPrice: form.sellPrice ? Number(form.sellPrice) : null,
                status: form.status,
                orderedAt: form.orderedAt,
                allottedAt: form.allottedAt || undefined,
                soldAt: form.soldAt || undefined,
                notes: form.notes.trim()
            };

            if (editingId) {
                await updateIpoOrder(editingId, payload);
            } else {
                await createIpoOrder(payload);
            }

            if (searchParams.get('newOrder')) {
                setSearchParams({}, { replace: true });
            }

            resetForm();
            await loadData();
            setIsFormOpen(false);
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menyimpan order IPO');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (row: IpoOrder) => {
        setEditingId(row.id);
        setForm({
            ownerId: row.ownerId,
            accountId: row.accountId,
            ticker: row.ticker,
            broker: row.broker,
            ipoPrice: String(row.ipoPrice),
            lotRequested: String(row.lotRequested),
            lotAllocated: String(row.lotAllocated || 0),
            sellPrice: row.sellPrice ? String(row.sellPrice) : '',
            status: row.status,
            orderedAt: String(row.orderedAt).slice(0, 10),
            allottedAt: row.allottedAt ? String(row.allottedAt).slice(0, 10) : '',
            soldAt: row.soldAt ? String(row.soldAt).slice(0, 10) : '',
            notes: row.notes || ''
        });
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Hapus order IPO ini?')) return;
        setSaving(true);
        try {
            await deleteIpoOrder(id);
            if (editingId === id) resetForm();
            await loadData();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus order IPO');
        } finally {
            setSaving(false);
        }
    };

    const statusCount = IPO_STATUS_OPTIONS.reduce<Record<IpoOrderStatus, number>>((acc, status) => {
        acc[status] = orders.filter((row) => row.status === status).length;
        return acc;
    }, { RENCANA: 0, PESAN: 0, JATAH: 0, TIDAK_JATAH: 0, JUAL: 0 });

    if (loading) return <Spinner message="Memuat modul IPO..." />;

    return (
        <div className="p-4 md:p-8 pb-32 mx-auto w-full max-w-6xl space-y-6">

            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <Link
                        to="/stocks"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <ArrowLeft size={14} /> Kembali ke Saham
                    </Link>
                    <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Pemesanan IPO</h1>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setIsFormOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 h-12 text-xs font-bold uppercase tracking-widest text-white hover:bg-emerald-500 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-emerald-500/25 shrink-0"
                >
                    <Plus size={16} /> Tambah Order IPO
                </button>
            </div>

            {/* Hero Stats Card */}
            <div className="rounded-[28px] border border-slate-100 bg-white p-3 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
                    {IPO_STATUS_OPTIONS.map((status) => (
                        <div
                            key={status}
                            className={`min-w-0 rounded-[22px] border px-4 py-4 sm:px-5 ${
                                status === 'RENCANA' ? 'border-violet-100 bg-gradient-to-br from-violet-50 via-white to-violet-50/60' :
                                status === 'PESAN' ? 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/60' :
                                status === 'JATAH' ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60' :
                                status === 'TIDAK_JATAH' ? 'border-rose-100 bg-gradient-to-br from-rose-50 via-white to-rose-50/60' :
                                'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/60'
                            }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_STYLE[status].dot}`} />
                                <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500/90">
                                    {STATUS_STYLE[status].label}
                                </p>
                            </div>
                            <p className="mt-2 text-2xl sm:text-3xl font-black leading-none tracking-[-0.04em] text-slate-900">
                                {statusCount[status]}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500/80">order</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Pemilik</span>
                        <select
                            value={selectedOwnerId}
                            onChange={(e) => setSelectedOwnerId(e.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-300 focus:bg-white"
                        >
                            <option value="ALL">Semua Pemilik</option>
                            {owners.map((owner) => (
                                <option key={owner.id} value={owner.id}>{owner.name}</option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-1.5">
                        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value as 'ALL' | IpoOrderStatus)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-blue-300 focus:bg-white"
                        >
                            <option value="ALL">Semua Status</option>
                            {IPO_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{STATUS_STYLE[status].label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-2">

                {/* Column 1: Daftar Pemesanan IPO */}
                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
                            <Wallet size={15} className="text-emerald-600" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 tracking-tight">Daftar Pemesanan IPO</h2>
                        {orders.length > 0 && (
                            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                                {orders.length}
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {orders.length === 0 ? (
                            <div className="rounded-2xl bg-slate-50 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                    <Wallet size={20} className="text-slate-400" />
                                </div>
                                <p className="text-sm font-bold text-slate-500">Belum ada order IPO</p>
                                <p className="text-xs text-slate-400">Tekan tombol Tambah Order IPO untuk mulai mencatat.</p>
                            </div>
                        ) : orders.map((row) => {
                            const style = STATUS_STYLE[row.status];
                            const pnl = row.sellPrice && row.lotAllocated
                                ? (row.sellPrice - row.ipoPrice) * row.lotAllocated * 100
                                : null;
                            return (
                                <div
                                    key={row.id}
                                    className={`rounded-2xl border bg-white/80 p-4 hover:shadow-md transition-all space-y-3 border-l-4 ${style.border} border-slate-100 hover:border-blue-100`}
                                >
                                    {/* Top row: ticker + status + actions */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-lg font-black text-slate-900 tracking-tight">{row.ticker}</span>
                                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${style.badge}`}>
                                                    {style.label}
                                                </span>
                                                {pnl !== null && (
                                                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${pnl >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
                                                        {formatCurrency(pnl)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-xs text-slate-500 font-medium">
                                                {row.broker} &middot; {row.lotRequested} pesan / {row.lotAllocated} jatah &middot; {formatCurrency(row.ipoPrice)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(row)}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => handleDelete(row.id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors disabled:opacity-50"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        <span className="text-slate-500">{row.account?.name}</span>
                                        <span className="text-slate-500">Order {String(row.orderedAt).slice(0, 10)}</span>
                                    </div>
                                    {/* Sub-transactions */}
                                    {row.transactions && row.transactions.length > 0 && (
                                        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-1.5 mt-2">
                                            {row.transactions.map((tx) => (
                                                <div key={tx.id} className="flex items-center justify-between text-xs">
                                                    <span className="font-bold text-slate-700">{tx.side} {tx.lot} lot</span>
                                                    <span className="text-slate-500 font-medium">{String(tx.tradedAt).slice(0, 10)} &middot; {formatCurrency(tx.netValue)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Column 2: Histori Transaksi IPO */}
                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                            <Wallet size={15} className="text-slate-500" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 tracking-tight">Histori Transaksi IPO</h2>
                        {transactions.length > 0 && (
                            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                                {transactions.length}
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {transactions.length === 0 ? (
                            <div className="rounded-2xl bg-slate-50 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                    <Wallet size={20} className="text-slate-400" />
                                </div>
                                <p className="text-sm font-bold text-slate-500">Belum ada histori transaksi</p>
                                <p className="text-xs text-slate-400">Transaksi saham hasil IPO akan tampil di sini.</p>
                            </div>
                        ) : transactions.map((row) => (
                            <div
                                key={row.id}
                                className="rounded-2xl border border-slate-100 bg-white/80 p-4 hover:shadow-md hover:border-blue-100 transition-all"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base font-black text-slate-900">{row.ticker}</span>
                                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${row.side === 'BUY' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
                                                {row.side}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 font-medium">
                                            {row.lot} lot &middot; {row.ipoOrder?.broker || row.account?.name}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-400">
                                            {String(row.tradedAt).slice(0, 10)} &middot; Netto {formatCurrency(row.netValue)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal Form */}
            {isFormOpen && (
                <div
                    className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
                    onMouseDown={resetForm}
                >
                    <div
                        className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                    {editingId ? 'Edit Order IPO' : isPlanStage ? 'Rencana IPO' : isReservationStage ? 'Reservasi IPO' : 'Update Status IPO'}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500">Isi detail pesanan dan status jatah IPO.</p>
                            </div>
                            <button
                                type="button"
                                onClick={resetForm}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Info banner */}
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] text-blue-700 font-medium leading-relaxed">
                                Status <span className="font-bold">Rencana</span> bisa disimpan tanpa cek saldo dan belum mengurangi RDN. Saat dana sudah tersedia, ubah ke <span className="font-bold">Pesan</span> atau <span className="font-bold">Jatah</span> agar order mulai direalisasikan.
                            </div>

                            {/* Account + Owner */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Akun Sekuritas</span>
                                    <select
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        value={form.accountId}
                                        onChange={(e) => {
                                            const nextAccountId = e.target.value;
                                            const account = stockAccounts.find((item) => item.id === nextAccountId);
                                            setForm((current) => ({
                                                ...current,
                                                accountId: nextAccountId,
                                                ownerId: account?.ownerId || current.ownerId
                                            }));
                                        }}
                                    >
                                        {stockAccounts.map((account) => (
                                            <option key={account.id} value={account.id}>{account.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Pemilik Otomatis</span>
                                    <div className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 flex items-center text-slate-700 font-semibold">
                                        {selectedOwner?.name || 'Mengikuti sekuritas'}
                                    </div>
                                </div>
                            </div>

                            {/* Ticker + Broker */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Kode Saham (Ticker)</span>
                                    <input
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-bold uppercase bg-slate-50 tracking-widest"
                                        placeholder="Contoh: GOTO"
                                        value={form.ticker}
                                        onChange={(e) => setForm((current) => ({ ...current, ticker: e.target.value.toUpperCase() }))}
                                    />
                                </label>
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Broker / Underwriter</span>
                                    <input
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        placeholder="Contoh: YP, CC"
                                        value={form.broker}
                                        onChange={(e) => setForm((current) => ({ ...current, broker: e.target.value }))}
                                    />
                                </label>
                            </div>

                            {/* IPO Price + Status */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga IPO (Rp)</span>
                                    <input
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        inputMode="numeric"
                                        placeholder="Contoh: 300"
                                        value={formatThousands(form.ipoPrice)}
                                        onChange={(e) => setForm((current) => ({ ...current, ipoPrice: sanitizeAmount(e.target.value) }))}
                                    />
                                </label>
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Status Pemesanan</span>
                                <div className="flex gap-1.5 flex-wrap">
                                    {IPO_STATUS_OPTIONS.map((status) => {
                                        const s = STATUS_STYLE[status];
                                        const isActive = form.status === status;
                                            return (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    onClick={() => setForm((current) => ({ ...current, status }))}
                                                    className={`rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-all ${isActive ? s.badge + ' shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}
                                                >
                                                    {s.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="px-1 text-[11px] text-slate-500">
                                        {isPlanStage
                                            ? 'Order masih berupa rencana. Dana RDN belum dipakai.'
                                            : isReservationStage
                                                ? 'Dana akan dicadangkan dari RDN sesuai lot pesan.'
                                                : 'Status ini akan merealisasikan order pada rekening RDN/sekuritas.'}
                                    </p>
                                </div>
                            </div>

                            {/* Lot requested */}
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jumlah Pesan (Lot)</span>
                                <input
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    inputMode="numeric"
                                    placeholder="Contoh: 10.000"
                                    value={formatThousands(form.lotRequested)}
                                    onChange={(e) => setForm((current) => ({ ...current, lotRequested: sanitizeAmount(e.target.value) }))}
                                />
                            </label>

                            {/* Allocation fields */}
                            {needsAllocationFields ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jatah Didapat (Lot)</span>
                                        <input
                                            className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                            inputMode="numeric"
                                            placeholder="Contoh: 10.000"
                                            value={formatThousands(form.lotAllocated)}
                                            onChange={(e) => setForm((current) => ({ ...current, lotAllocated: sanitizeAmount(e.target.value) }))}
                                        />
                                    </label>
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Penjatahan</span>
                                        <input
                                            type="date"
                                            className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                            value={form.allottedAt}
                                            onChange={(e) => setForm((current) => ({ ...current, allottedAt: e.target.value }))}
                                        />
                                    </label>
                                </div>
                            ) : null}

                            {/* Order date */}
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Pesan</span>
                                <input
                                    type="date"
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={form.orderedAt}
                                    onChange={(e) => setForm((current) => ({ ...current, orderedAt: e.target.value }))}
                                />
                            </label>

                            {/* Sell fields */}
                            {needsSellFields ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga Jual (Rp)</span>
                                        <input
                                            className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                            inputMode="numeric"
                                            placeholder="Contoh: 450"
                                            value={formatThousands(form.sellPrice)}
                                            onChange={(e) => setForm((current) => ({ ...current, sellPrice: sanitizeAmount(e.target.value) }))}
                                        />
                                    </label>
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Jual</span>
                                        <input
                                            type="date"
                                            className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                            value={form.soldAt}
                                            onChange={(e) => setForm((current) => ({ ...current, soldAt: e.target.value }))}
                                        />
                                    </label>
                                </div>
                            ) : null}

                            {/* Notes */}
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Catatan Tambahan (Opsional)</span>
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[96px] bg-slate-50 font-medium resize-none"
                                    placeholder="Tuliskan catatan terkait pemesanan ini..."
                                    value={form.notes}
                                    onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                                />
                            </label>

                            {/* Submit */}
                            <button
                                disabled={saving || stockAccounts.length === 0}
                                className="w-full rounded-2xl bg-emerald-600 h-12 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-500"
                            >
                                {editingId ? <Save size={16} /> : <Plus size={16} />}
                                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Order IPO'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StocksIpo;
