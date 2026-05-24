import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Save, Trash2 } from 'lucide-react';
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

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];
const IPO_STATUS_OPTIONS: IpoOrderStatus[] = ['PESAN', 'JATAH', 'TIDAK_JATAH', 'JUAL'];

const emptyForm = () => ({
    ownerId: '',
    accountId: '',
    ticker: '',
    broker: '',
    ipoPrice: '',
    lotRequested: '',
    lotAllocated: '',
    sellPrice: '',
    status: 'PESAN' as IpoOrderStatus,
    orderedAt: new Date().toISOString().slice(0, 10),
    allottedAt: '',
    soldAt: '',
    notes: ''
});

const StocksIpo = () => {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [orders, setOrders] = useState<IpoOrder[]>([]);
    const [transactions, setTransactions] = useState<IpoTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState<'ALL' | IpoOrderStatus>('ALL');
    const [form, setForm] = useState(emptyForm());

    const stockAccounts = useMemo(
        () => accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type)),
        [accounts]
    );
    const selectedAccount = stockAccounts.find((account) => account.id === form.accountId) || null;
    const selectedOwner = owners.find((owner) => owner.id === (selectedAccount?.ownerId || form.ownerId)) || null;
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

            resetForm();
            await loadData();
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
    }, { PESAN: 0, JATAH: 0, TIDAK_JATAH: 0, JUAL: 0 });

    if (loading) return <Spinner message="Memuat modul IPO..." />;

    return (
        <div className="p-4 md:p-8 pb-32 mx-auto w-full max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link to="/stocks" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                        <ArrowLeft size={14} /> Kembali ke Saham
                    </Link>
                    <h1 className="mt-3 text-2xl font-black text-slate-900">IPO</h1>
                    <p className="mt-1 text-sm text-slate-500">Catat order IPO dan histori BUY/SELL hasil status jatah.</p>
                </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] bg-slate-900 p-5 sm:p-6 shadow-xl shadow-blue-900/5">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-blue-500/25 blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none"></div>

                <div className="relative z-10 flex justify-between divide-x divide-white/10">
                    {IPO_STATUS_OPTIONS.map((status, index) => (
                        <div key={status} className={`flex flex-1 flex-col justify-center px-1 sm:px-4 text-center sm:text-left ${index === 0 ? 'sm:pl-0' : ''} ${index === IPO_STATUS_OPTIONS.length - 1 ? 'sm:pr-0' : ''}`}>
                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">{status.replace('_', ' ')}</p>
                            <p className="text-xl sm:text-3xl font-black text-white tracking-tight">{statusCount[status]}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
                <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit order IPO' : isReservationStage ? 'Reservasi IPO' : 'Update status IPO'}</h2>
                            <p className="text-xs text-slate-500">Pendanaan dilakukan dari menu Home/Rekening agar tidak terjadi pencatatan ganda.</p>
                        </div>
                        {editingId ? <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-slate-500">Batal</button> : null}
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] text-blue-700">
                        Jika perlu tambah dana sekuritas, lakukan dari menu Home/Rekening. Halaman ini hanya untuk order IPO dan status jatahnya.
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Akun Sekuritas</span>
                            <select
                                className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50"
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
                                {stockAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                            </select>
                        </label>
                        <div className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Pemilik Otomatis</span>
                            <div className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 flex items-center text-slate-700 font-semibold">
                                {selectedOwner?.name || 'Mengikuti rekening sekuritas'}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Kode Saham (Ticker)</span>
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-semibold uppercase bg-slate-50" placeholder="Contoh: GOTO" value={form.ticker} onChange={(e) => setForm((current) => ({ ...current, ticker: e.target.value.toUpperCase() }))} />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Broker / Underwriter</span>
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" placeholder="Contoh: YP, CC" value={form.broker} onChange={(e) => setForm((current) => ({ ...current, broker: e.target.value }))} />
                        </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga IPO (Rp)</span>
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Contoh: 300" value={form.ipoPrice} onChange={(e) => setForm((current) => ({ ...current, ipoPrice: e.target.value.replace(/\D/g, '') }))} />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Status Pemesanan</span>
                            <select className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-semibold text-blue-700" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as IpoOrderStatus }))}>
                                {IPO_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                            </select>
                        </label>
                    </div>

                    <label className="space-y-1 block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jumlah Pesan (Lot)</span>
                        <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Berapa lot dipesan?" value={form.lotRequested} onChange={(e) => setForm((current) => ({ ...current, lotRequested: e.target.value.replace(/\D/g, '') }))} />
                    </label>

                    {needsAllocationFields ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jatah Didapat (Lot)</span>
                                <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Berapa lot didapat?" value={form.lotAllocated} onChange={(e) => setForm((current) => ({ ...current, lotAllocated: e.target.value.replace(/\D/g, '') }))} />
                            </label>
                            <label className="space-y-1 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Penjatahan</span>
                                <input type="date" className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" value={form.allottedAt} onChange={(e) => setForm((current) => ({ ...current, allottedAt: e.target.value }))} />
                            </label>
                        </div>
                    ) : null}

                    <label className="space-y-1 block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Pesan</span>
                        <input type="date" className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" value={form.orderedAt} onChange={(e) => setForm((current) => ({ ...current, orderedAt: e.target.value }))} />
                    </label>

                    {needsSellFields ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga Jual (Rp)</span>
                                <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Contoh: 450" value={form.sellPrice} onChange={(e) => setForm((current) => ({ ...current, sellPrice: e.target.value.replace(/\D/g, '') }))} />
                            </label>
                            <label className="space-y-1 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Jual</span>
                                <input type="date" className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" value={form.soldAt} onChange={(e) => setForm((current) => ({ ...current, soldAt: e.target.value }))} />
                            </label>
                        </div>
                    ) : null}

                    <label className="space-y-1 block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Catatan Tambahan (Opsional)</span>
                        <textarea className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[96px] bg-slate-50" placeholder="Tuliskan catatan terkait pemesanan ini..." value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
                    </label>

                    <button disabled={saving || stockAccounts.length === 0} className="w-full rounded-2xl bg-slate-900 h-12 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {editingId ? <Save size={16} /> : <Plus size={16} />}
                        {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Order IPO'}
                    </button>
                </form>

                <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row">
                            <select className="rounded-2xl border border-slate-200 px-4 h-11 text-sm lg:w-56" value={selectedOwnerId} onChange={(e) => setSelectedOwnerId(e.target.value)}>
                                <option value="ALL">Semua pemilik</option>
                                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                            </select>
                            <select className="rounded-2xl border border-slate-200 px-4 h-11 text-sm lg:w-56" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as 'ALL' | IpoOrderStatus)}>
                                <option value="ALL">Semua status</option>
                                {IPO_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>

                        <div className="space-y-3">
                            {orders.length === 0 ? (
                                <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada order IPO.</div>
                            ) : orders.map((row) => (
                                <div key={row.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-base font-bold text-slate-900">{row.ticker}</span>
                                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600">{row.status}</span>
                                            </div>
                                            <p className="mt-1 text-sm text-slate-500">
                                                {row.broker} · {row.lotRequested} pesan / {row.lotAllocated} jatah · {formatCurrency(row.ipoPrice)}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {row.account?.name} · Order {String(row.orderedAt).slice(0, 10)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => handleEdit(row)} className="rounded-xl bg-slate-100 p-2 text-slate-600">
                                                <Pencil size={15} />
                                            </button>
                                            <button type="button" disabled={saving} onClick={() => handleDelete(row.id)} className="rounded-xl bg-rose-50 p-2 text-rose-600 disabled:opacity-50">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>

                                    {row.transactions && row.transactions.length > 0 ? (
                                        <div className="rounded-2xl bg-slate-50 p-3 space-y-2">
                                            {row.transactions.map((tx) => (
                                                <div key={tx.id} className="flex items-center justify-between text-sm">
                                                    <span className="font-semibold text-slate-700">{tx.side} {tx.lot} lot</span>
                                                    <span className="text-slate-500">{String(tx.tradedAt).slice(0, 10)} · {formatCurrency(tx.netValue)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">Belum ada histori transaksi dari IPO ini.</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-bold text-slate-900">Histori Transaksi IPO</h2>
                        <div className="mt-4 space-y-3">
                            {transactions.length === 0 ? (
                                <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada histori transaksi IPO.</div>
                            ) : transactions.map((tx) => (
                                <div key={tx.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-slate-900">{tx.ticker} · {tx.side}</p>
                                        <p className="text-sm text-slate-500">{tx.lot} lot · {tx.ipoOrder?.broker || tx.account?.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-slate-900">{formatCurrency(tx.netValue)}</p>
                                        <p className="text-xs text-slate-400">{String(tx.tradedAt).slice(0, 10)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StocksIpo;
