import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Save, Trash2, Wallet } from 'lucide-react';
import Spinner from '../components/Spinner';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import {
    createStockTransaction,
    deleteStockTransaction,
    fetchStockPositions,
    fetchStockTransactions,
    updateStockTransaction,
    type StockPosition,
    type StockTransaction
} from '../services/stocks';

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(value || 0);

const STOCK_ACCOUNT_TYPES = ['RDN', 'Sekuritas'];

const emptyForm = () => ({
    ownerId: '',
    accountId: '',
    ticker: '',
    side: 'BUY' as 'BUY' | 'SELL',
    lot: '',
    pricePerShare: '',
    tradedAt: new Date().toISOString().slice(0, 10),
    notes: ''
});

const Stocks = () => {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<StockTransaction[]>([]);
    const [positions, setPositions] = useState<StockPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');
    const [selectedAccountId, setSelectedAccountId] = useState('ALL');
    const [tickerFilter, setTickerFilter] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm());

    const stockAccounts = useMemo(
        () => accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type)),
        [accounts]
    );
    const selectedAccount = stockAccounts.find((account) => account.id === form.accountId) || null;
    const selectedOwner = owners.find((owner) => owner.id === (selectedAccount?.ownerId || form.ownerId)) || null;

    const loadData = async () => {
        try {
            const meta = await fetchMasterMeta();
            const nextAccounts = meta.accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type));
            setOwners(meta.owners);
            setAccounts(meta.accounts);

            const filter = {
                ownerId: selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined,
                accountId: selectedAccountId !== 'ALL' ? selectedAccountId : undefined,
                ticker: tickerFilter.trim().toUpperCase() || undefined
            };

            const [txRows, positionRows] = await Promise.all([
                fetchStockTransactions(filter),
                fetchStockPositions(filter)
            ]);

            setTransactions(txRows);
            setPositions(positionRows);
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
    }, [selectedOwnerId, selectedAccountId, tickerFilter]);

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
                side: form.side,
                lot: Number(form.lot),
                pricePerShare: Number(form.pricePerShare),
                tradedAt: form.tradedAt,
                notes: form.notes.trim()
            };

            if (editingId) {
                await updateStockTransaction(editingId, payload);
            } else {
                await createStockTransaction(payload);
            }

            resetForm();
            await loadData();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menyimpan transaksi saham');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (row: StockTransaction) => {
        setEditingId(row.id);
        setForm({
            ownerId: row.ownerId,
            accountId: row.accountId,
            ticker: row.ticker,
            side: row.side,
            lot: String(row.lot),
            pricePerShare: String(row.pricePerShare),
            tradedAt: String(row.tradedAt).slice(0, 10),
            notes: row.notes || ''
        });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Hapus transaksi saham ini?')) return;
        setSaving(true);
        try {
            await deleteStockTransaction(id);
            if (editingId === id) resetForm();
            await loadData();
        } catch (error: any) {
            alert(error?.response?.data?.error || 'Gagal menghapus transaksi saham');
        } finally {
            setSaving(false);
        }
    };

    const totalOpenLots = positions.reduce((sum, row) => sum + row.totalLots, 0);
    const totalRealizedPnl = positions.reduce((sum, row) => sum + row.realizedPnl, 0);

    if (loading) return <Spinner message="Memuat modul saham..." />;

    return (
        <div className="p-4 md:p-8 pb-32 mx-auto w-full max-w-6xl space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link to="/investment" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                        <ArrowLeft size={14} /> Kembali ke Investasi
                    </Link>
                    <h1 className="mt-3 text-2xl font-black text-slate-900">Saham</h1>
                </div>
            </div>

            {stockAccounts.length === 0 && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                    <p className="text-sm font-bold text-slate-900">Belum ada rekening saham</p>
                    <p className="mt-1 text-xs text-slate-600">Tambahkan rekening bertipe `RDN` atau `Sekuritas` dari menu Setting.</p>
                </div>
            )}

            <div className="relative overflow-hidden rounded-[28px] bg-slate-900 p-5 sm:p-6 shadow-xl shadow-blue-900/5">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-blue-500/25 blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none"></div>

                <div className="relative z-10 flex justify-between divide-x divide-white/10">
                    <div className="flex flex-1 flex-col justify-center px-1 sm:px-4 pl-0 text-center sm:text-left">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Posisi Aktif</p>
                        <p className="text-lg sm:text-3xl font-black text-white tracking-tight">{totalOpenLots.toLocaleString('id-ID')} <span className="text-[10px] sm:text-sm font-bold text-white/50">lot</span></p>
                    </div>
                    <div className="flex flex-1 flex-col justify-center px-1 sm:px-4 text-center sm:text-left">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Realized PnL</p>
                        <p className={`text-lg sm:text-3xl font-black tracking-tight ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(totalRealizedPnl)}
                        </p>
                    </div>
                    <div className="flex flex-1 flex-col justify-center px-1 sm:px-4 pr-0 text-center sm:text-left">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Dipantau</p>
                        <p className="text-lg sm:text-3xl font-black text-white tracking-tight">{positions.length}</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{editingId ? 'Edit transaksi' : 'Tambah transaksi'}</h2>
                            <p className="text-xs text-slate-500">Pendanaan dilakukan dari menu Home/Rekening agar pencatatan tidak dobel.</p>
                        </div>
                        {editingId ? (
                            <button type="button" onClick={resetForm} className="text-xs font-bold uppercase tracking-widest text-slate-500">Batal</button>
                        ) : null}
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] text-blue-700">
                        Top up sekuritas tidak dicatat di sini. Tambahkan dana dari menu Home/Rekening, lalu catat BUY/SELL di modul saham.
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
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-semibold uppercase bg-slate-50" placeholder="Contoh: BBCA" value={form.ticker} onChange={(e) => setForm((current) => ({ ...current, ticker: e.target.value.toUpperCase() }))} />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Aksi (Beli/Jual)</span>
                            <select className={`w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-bold bg-slate-50 ${form.side === 'BUY' ? 'text-blue-600' : 'text-rose-600'}`} value={form.side} onChange={(e) => setForm((current) => ({ ...current, side: e.target.value as 'BUY' | 'SELL' }))}>
                                <option value="BUY">BUY</option>
                                <option value="SELL">SELL</option>
                            </select>
                        </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jumlah Lot</span>
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Contoh: 10" value={form.lot} onChange={(e) => setForm((current) => ({ ...current, lot: e.target.value.replace(/\D/g, '') }))} />
                        </label>
                        <label className="space-y-1 block">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga per lembar (Rp)</span>
                            <input className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" inputMode="numeric" placeholder="Contoh: 1500" value={form.pricePerShare} onChange={(e) => setForm((current) => ({ ...current, pricePerShare: e.target.value.replace(/\D/g, '') }))} />
                        </label>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="mt-1 text-sm text-slate-700">
                            Broker {Number(selectedAccount?.stockBrokerFeePercent || 0).toLocaleString('id-ID')}% · Levy {Number(selectedAccount?.stockLevyFeePercent || 0).toLocaleString('id-ID')}%
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            Ubah dari menu Setting jika sekuritas memakai tarif berbeda.
                        </p>
                    </div>

                    <label className="space-y-1 block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Transaksi</span>
                        <input type="date" className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50" value={form.tradedAt} onChange={(e) => setForm((current) => ({ ...current, tradedAt: e.target.value }))} />
                    </label>

                    <label className="space-y-1 block">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Catatan Tambahan (Opsional)</span>
                        <textarea className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[96px] bg-slate-50" placeholder="Tuliskan alasan beli/jual..." value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} />
                    </label>

                    <button disabled={saving || stockAccounts.length === 0} className="w-full rounded-2xl bg-blue-600 h-12 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {editingId ? <Save size={16} /> : <Plus size={16} />}
                        {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Transaksi'}
                    </button>
                </form>

                <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row">
                            <select className="rounded-2xl border border-slate-200 px-4 h-11 text-sm lg:w-56" value={selectedOwnerId} onChange={(e) => setSelectedOwnerId(e.target.value)}>
                                <option value="ALL">Semua pemilik</option>
                                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                            </select>
                            <select className="rounded-2xl border border-slate-200 px-4 h-11 text-sm lg:w-56" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                                <option value="ALL">Semua rekening</option>
                                {stockAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                            </select>
                            <input className="rounded-2xl border border-slate-200 px-4 h-11 text-sm lg:w-40 uppercase" placeholder="Ticker" value={tickerFilter} onChange={(e) => setTickerFilter(e.target.value.toUpperCase())} />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400">
                                        <th className="pb-3">Ticker</th>
                                        <th className="pb-3">Lot</th>
                                        <th className="pb-3">Avg Cost</th>
                                        <th className="pb-3">Realized PnL</th>
                                        <th className="pb-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {positions.length === 0 ? (
                                        <tr><td colSpan={5} className="py-6 text-slate-500">Belum ada posisi saham.</td></tr>
                                    ) : positions.map((row) => (
                                        <tr key={row.ticker} className="border-t border-slate-100">
                                            <td className="py-3 font-bold text-slate-900">{row.ticker}</td>
                                            <td className="py-3">{row.totalLots.toLocaleString('id-ID')} lot</td>
                                            <td className="py-3">{formatCurrency(row.avgCostPerShare)}</td>
                                            <td className={`py-3 font-semibold ${row.realizedPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(row.realizedPnl)}</td>
                                            <td className="py-3 text-xs text-slate-500">{row.buyCount} buy / {row.sellCount} sell</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Wallet size={16} className="text-slate-400" />
                            <h2 className="text-lg font-bold text-slate-900">Histori Transaksi</h2>
                        </div>
                        <div className="space-y-3">
                            {transactions.length === 0 ? (
                                <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada transaksi saham.</div>
                            ) : transactions.map((row) => (
                                <div key={row.id} className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-base font-bold text-slate-900">{row.ticker}</span>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${row.side === 'BUY' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                                {row.side}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-500">
                                            {row.lot} lot · {formatCurrency(row.pricePerShare)} · {row.account?.name}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {String(row.tradedAt).slice(0, 10)} · Netto {formatCurrency(row.netValue)}
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
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Stocks;
