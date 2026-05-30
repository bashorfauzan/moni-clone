import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Save, Trash2, Wallet, X } from 'lucide-react';
import Spinner from '../components/Spinner';
import { useTransaction } from '../context/TransactionContext';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import { computeStockMoney } from '../services/stocksDirect';
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

const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');
const getOwnerBalance = (account: Account | null | undefined, ownerId?: string) =>
    Number((ownerId && account?.ownerBalances?.[ownerId]) || 0);

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
    const { openModal } = useTransaction();
    const [searchParams, setSearchParams] = useSearchParams();
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
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const tickerInputRef = useRef<HTMLInputElement | null>(null);
    const lotInputRef = useRef<HTMLInputElement | null>(null);
    const priceInputRef = useRef<HTMLInputElement | null>(null);
    const submitButtonRef = useRef<HTMLButtonElement | null>(null);

    const stockAccounts = useMemo(
        () => accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type)),
        [accounts]
    );
    const availableStockAccounts = useMemo(
        () => stockAccounts
            .filter((account) => {
                if (editingId && account.id === form.accountId) return true;
                if (selectedOwnerId !== 'ALL') return getOwnerBalance(account, selectedOwnerId) > 0;
                return Object.values(account.ownerBalances || {}).some((amount) => Number(amount || 0) > 0);
            })
            .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0)),
        [editingId, form.accountId, selectedOwnerId, stockAccounts]
    );
    const selectedAccount = stockAccounts.find((account) => account.id === form.accountId) || null;
    const accountOwnerOptions = useMemo(
        () => selectedAccount
            ? owners
                .map((owner) => ({
                    ...owner,
                    balance: getOwnerBalance(selectedAccount, owner.id)
                }))
                .filter((owner) => editingId ? (owner.balance > 0 || owner.id === form.ownerId) : owner.balance > 0)
                .sort((a, b) => b.balance - a.balance)
            : [],
        [editingId, form.ownerId, owners, selectedAccount]
    );
    const selectedOwner = owners.find((owner) => owner.id === form.ownerId) || null;
    const enteredLot = Number(form.lot || 0);
    const enteredPricePerShare = Number(form.pricePerShare || 0);
    const tradePreview = useMemo(() => {
        if (!selectedAccount || enteredLot <= 0 || enteredPricePerShare <= 0) return null;

        return computeStockMoney({
            side: form.side,
            lot: enteredLot,
            pricePerShare: enteredPricePerShare,
            brokerFeePercent: Number(selectedAccount.stockBrokerFeePercent || 0),
            levyFeePercent: Number(selectedAccount.stockLevyFeePercent || 0)
        });
    }, [enteredLot, enteredPricePerShare, form.side, selectedAccount]);
    const availableCash = getOwnerBalance(selectedAccount, form.ownerId);
    const requiredCash = form.side === 'BUY' ? Number(tradePreview?.netValue || 0) : 0;
    const remainingCashAfterBuy = form.side === 'BUY' ? availableCash - requiredCash : null;
    const isBuyFundsEnough = form.side !== 'BUY' || !tradePreview || remainingCashAfterBuy === null || remainingCashAfterBuy >= 0;
    const isSubmitBlockedByFunds = form.side === 'BUY' && Boolean(tradePreview) && !isBuyFundsEnough;

    const loadData = async () => {
        try {
            const meta = await fetchMasterMeta();
            const nextAccounts = meta.accounts.filter((account) => STOCK_ACCOUNT_TYPES.includes(account.type));
            const fundedAccounts = nextAccounts.filter((account) =>
                Object.values(account.ownerBalances || {}).some((amount) => Number(amount || 0) > 0)
            );
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
                accountId: current.accountId || fundedAccounts[0]?.id || nextAccounts[0]?.id || '',
                ownerId: current.ownerId
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [selectedOwnerId, selectedAccountId, tickerFilter]);

    useEffect(() => {
        const action = searchParams.get('action');
        if (!action || availableStockAccounts.length === 0) return;

        const requestedAccountId = searchParams.get('accountId');
        const requestedOwnerId = searchParams.get('ownerId');
        const requestedTicker = searchParams.get('ticker') || '';
        const requestedLot = searchParams.get('lot') || '';
        const requestedPricePerShare = searchParams.get('pricePerShare') || '';
        const requestedTradedAt = searchParams.get('tradedAt') || new Date().toISOString().slice(0, 10);
        const requestedNotes = searchParams.get('notes') || '';
        const resolvedAccount = availableStockAccounts.find((account) => account.id === requestedAccountId) || availableStockAccounts[0];
        const resolvedOwnerId = requestedOwnerId
            || owners
                .find((owner) => getOwnerBalance(resolvedAccount, owner.id) > 0)?.id
            || '';

        setEditingId(null);
        setForm({
            ...emptyForm(),
            side: action === 'sell' ? 'SELL' : 'BUY',
            accountId: resolvedAccount?.id || '',
            ownerId: resolvedOwnerId,
            ticker: requestedTicker.toUpperCase(),
            lot: requestedLot,
            pricePerShare: requestedPricePerShare,
            tradedAt: requestedTradedAt,
            notes: requestedNotes
        });
        setIsFormOpen(true);

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('action');
        nextParams.delete('accountId');
        nextParams.delete('ownerId');
        nextParams.delete('ticker');
        nextParams.delete('lot');
        nextParams.delete('pricePerShare');
        nextParams.delete('tradedAt');
        nextParams.delete('notes');
        setSearchParams(nextParams, { replace: true });
    }, [availableStockAccounts, owners, searchParams, setSearchParams]);

    useEffect(() => {
        if (!selectedAccount) return;
        if (accountOwnerOptions.some((owner) => owner.id === form.ownerId)) return;

        setForm((current) => ({
            ...current,
            ownerId: accountOwnerOptions[0]?.id || ''
        }));
    }, [accountOwnerOptions, form.ownerId, selectedAccount]);

    useEffect(() => {
        if (!isFormOpen) return;

        const focusTarget = window.setTimeout(() => {
            if (!form.ticker.trim()) {
                tickerInputRef.current?.focus();
                return;
            }
            if (!form.lot.trim()) {
                lotInputRef.current?.focus();
                return;
            }
            if (!form.pricePerShare.trim()) {
                priceInputRef.current?.focus();
                return;
            }
            submitButtonRef.current?.focus();
        }, 80);

        return () => window.clearTimeout(focusTarget);
    }, [isFormOpen]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            ...emptyForm(),
            ownerId: availableStockAccounts[0]
                ? owners.find((owner) => getOwnerBalance(availableStockAccounts[0], owner.id) > 0)?.id || ''
                : '',
            accountId: availableStockAccounts[0]?.id || ''
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
            setIsFormOpen(false);
        } catch (error: any) {
            alert(error?.response?.data?.error || error?.message || 'Gagal menyimpan transaksi saham');
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
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Hapus transaksi saham ini?')) return;
        setSaving(true);
        try {
            await deleteStockTransaction(id);
            if (editingId === id) resetForm();
            await loadData();
        } catch (error: any) {
            alert(error?.response?.data?.error || error?.message || 'Gagal menghapus transaksi saham');
        } finally {
            setSaving(false);
        }
    };

    const handleOpenTopUpRdn = () => {
        if (!selectedAccount) return;

        setIsFormOpen(false);
        setEditingId(null);
        openModal('INVESTMENT', {
            ownerId: form.ownerId || undefined,
            destinationAccountId: selectedAccount.id,
            returnTo: 'stocks',
            returnAccountId: selectedAccount.id,
            returnOwnerId: form.ownerId || undefined,
            returnAction: 'buy',
            returnTicker: form.ticker.trim().toUpperCase(),
            returnLot: form.lot,
            returnPricePerShare: form.pricePerShare,
            returnTradedAt: form.tradedAt,
            returnNotes: form.notes
        });
    };

    const activePositions = useMemo(() => positions.filter((row) => row.totalLots > 0), [positions]);
    const totalOpenLots = activePositions.reduce((sum, row) => sum + row.totalLots, 0);
    const totalRealizedPnl = positions.reduce((sum, row) => sum + row.realizedPnl, 0);

    if (loading) return <Spinner message="Memuat modul saham..." />;

    return (
        <div className="p-4 md:p-8 pb-32 mx-auto w-full max-w-6xl space-y-6">

            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <Link
                        to="/investment"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <ArrowLeft size={14} /> Kembali ke Investasi
                    </Link>
                    <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Portofolio Saham</h1>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setIsFormOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 h-12 text-xs font-bold uppercase tracking-widest text-white hover:bg-blue-500 transition-all hover:-translate-y-0.5 active:scale-95 shadow-lg shadow-blue-500/25 shrink-0"
                >
                    <Plus size={16} /> Tambah Transaksi
                </button>
            </div>

            {/* No account warning */}
            {availableStockAccounts.length === 0 && (
                <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5">
                    <p className="text-sm font-bold text-slate-900">Belum ada rekening saham yang memiliki dana</p>
                    <p className="mt-1 text-xs text-slate-600">Tambahkan dana ke rekening bertipe <code className="font-mono bg-amber-100 px-1 rounded">RDN</code> atau <code className="font-mono bg-amber-100 px-1 rounded">Sekuritas</code>, lalu akun akan muncul di sini.</p>
                </div>
            )}

            {/* Hero Stats Card */}
            <div className="relative overflow-hidden rounded-[28px] bg-slate-900 p-6 sm:p-8 shadow-2xl shadow-slate-900/20">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />
                <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />

                <div className="relative z-10 grid grid-cols-3 divide-x divide-white/10">
                    <div className="flex flex-col justify-center min-w-0 px-2 sm:px-6 pl-0">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5 truncate">Posisi Aktif</p>
                        <p className="text-xl sm:text-3xl font-black text-white tracking-tight leading-none truncate">
                            {totalOpenLots.toLocaleString('id-ID')}
                        </p>
                        <p className="mt-1 text-[10px] sm:text-xs font-bold text-white/40">lot</p>
                    </div>
                    <div className="flex flex-col justify-center min-w-0 px-2 sm:px-6">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5 truncate">Realized PnL</p>
                        <p className={`text-sm sm:text-2xl font-black tracking-tight leading-tight break-words ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(totalRealizedPnl)}
                        </p>
                        <p className="mt-1 text-[10px] sm:text-xs font-bold text-white/40">total</p>
                    </div>
                    <div className="flex flex-col justify-center min-w-0 px-2 sm:px-6 pr-0">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5 truncate">Dipantau</p>
                        <p className="text-xl sm:text-3xl font-black text-white tracking-tight leading-none truncate">
                            {activePositions.length}
                        </p>
                        <p className="mt-1 text-[10px] sm:text-xs font-bold text-white/40">emiten</p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm p-4 space-y-3">
                {/* Owner pill segments */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Pemilik:</span>
                    <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 flex-wrap">
                        <button
                            onClick={() => setSelectedOwnerId('ALL')}
                            className={`rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${selectedOwnerId === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Semua
                        </button>
                        {owners.map((owner) => (
                            <button
                                key={owner.id}
                                onClick={() => setSelectedOwnerId(owner.id)}
                                className={`rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${selectedOwnerId === owner.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {owner.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Account + Ticker search row */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                        className="rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium cursor-pointer flex-1"
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                        <option value="ALL">Semua Rekening</option>
                        {stockAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{account.name}</option>
                        ))}
                    </select>
                    <input
                        className="rounded-2xl border border-slate-200 px-4 h-11 text-sm uppercase bg-slate-50 font-medium placeholder:normal-case placeholder:text-slate-400 flex-1"
                        placeholder="Cari Ticker (mis. BBCA)"
                        value={tickerFilter}
                        onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
                    />
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-2">

                {/* Column 1: Posisi Saham Aktif */}
                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
                            <Wallet size={15} className="text-blue-600" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 tracking-tight">Posisi Saham Aktif</h2>
                        {activePositions.length > 0 && (
                            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                                {activePositions.length}
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {activePositions.length === 0 ? (
                            <div className="rounded-2xl bg-slate-50 flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                    <Wallet size={20} className="text-slate-400" />
                                </div>
                                <p className="text-sm font-bold text-slate-500">Belum ada posisi aktif</p>
                                <p className="text-xs text-slate-400">Tambahkan transaksi BUY untuk melihat posisi saham.</p>
                            </div>
                        ) : activePositions.map((row) => (
                            <div
                                key={row.ticker}
                                className={`rounded-2xl border bg-white/80 p-4 hover:shadow-md transition-all space-y-3 border-l-4 ${row.realizedPnl >= 0 ? 'border-l-blue-500 border-slate-100 hover:border-blue-100' : 'border-l-rose-400 border-slate-100 hover:border-rose-100'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-lg font-black text-slate-900 tracking-tight">{row.ticker}</p>
                                        <p className="mt-0.5 text-xs text-slate-500 font-medium">
                                            {row.totalLots.toLocaleString('id-ID')} lot &middot; Avg {formatCurrency(row.avgCostPerShare)}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest border ${row.realizedPnl >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>
                                        {formatCurrency(row.realizedPnl)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>Realized PnL</span>
                                    <span className="text-slate-500">{row.buyCount} Beli / {row.sellCount} Jual</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Histori Transaksi */}
                <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100">
                            <Wallet size={15} className="text-slate-500" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 tracking-tight">Histori Transaksi</h2>
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
                                <p className="text-sm font-bold text-slate-500">Belum ada transaksi</p>
                                <p className="text-xs text-slate-400">Transaksi saham akan tampil di sini.</p>
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
                                            {row.lot} lot &middot; {formatCurrency(row.pricePerShare)} &middot; {row.account?.name}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-slate-400">
                                            {String(row.tradedAt).slice(0, 10)} &middot; Netto {formatCurrency(row.netValue)}
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
                                    {editingId ? 'Edit Transaksi' : 'Tambah Transaksi'}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500">Nilai bruto, fee, dan netto dihitung otomatis.</p>
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
                                Top up sekuritas tidak dicatat di sini. Tambahkan dana dari menu Home/Rekening, lalu catat BUY/SELL di modul saham.
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
                                            const account = availableStockAccounts.find((item) => item.id === nextAccountId);
                                            setForm((current) => ({
                                                ...current,
                                                accountId: nextAccountId,
                                                ownerId: owners.find((owner) => getOwnerBalance(account, owner.id) > 0)?.id || ''
                                            }));
                                        }}
                                    >
                                        {availableStockAccounts.map((account) => (
                                            <option key={account.id} value={account.id}>{account.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Pemilik Dana</span>
                                    <select
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        value={form.ownerId}
                                        onChange={(e) => setForm((current) => ({ ...current, ownerId: e.target.value }))}
                                        disabled={accountOwnerOptions.length === 0}
                                    >
                                        <option value="" disabled>Pilih pemilik dana...</option>
                                        {accountOwnerOptions.map((owner) => (
                                            <option key={owner.id} value={owner.id}>
                                                {owner.name} ({formatCurrency(owner.balance)})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            {/* Ticker + BUY/SELL toggle */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Kode Saham (Ticker)</span>
                                    <input
                                        ref={tickerInputRef}
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-bold uppercase bg-slate-50 tracking-widest"
                                        placeholder="Contoh: BBCA"
                                        value={form.ticker}
                                        maxLength={4}
                                        onChange={(e) => {
                                            const nextTicker = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
                                            setForm((current) => ({ ...current, ticker: nextTicker }));

                                            if (nextTicker.length === 4) {
                                                window.setTimeout(() => {
                                                    lotInputRef.current?.focus();
                                                }, 0);
                                            }
                                        }}
                                    />
                                </label>
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Aksi</span>
                                    <div className="flex gap-2 h-11">
                                        <button
                                            type="button"
                                            onClick={() => setForm((current) => ({ ...current, side: 'BUY' }))}
                                            className={`flex-1 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all border ${form.side === 'BUY' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'}`}
                                        >
                                            BUY
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setForm((current) => ({ ...current, side: 'SELL' }))}
                                            className={`flex-1 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all border ${form.side === 'SELL' ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-rose-200 hover:text-rose-500'}`}
                                        >
                                            SELL
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Lot + Price */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Jumlah Lot</span>
                                    <input
                                        ref={lotInputRef}
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        inputMode="numeric"
                                        placeholder="Contoh: 10.000"
                                        value={formatThousands(form.lot)}
                                        onChange={(e) => setForm((current) => ({ ...current, lot: sanitizeAmount(e.target.value) }))}
                                    />
                                </label>
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Harga per Lembar (Rp)</span>
                                    <input
                                        ref={priceInputRef}
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                        inputMode="numeric"
                                        placeholder="Contoh: 1.500"
                                        value={formatThousands(form.pricePerShare)}
                                        onChange={(e) => setForm((current) => ({ ...current, pricePerShare: sanitizeAmount(e.target.value) }))}
                                    />
                                </label>
                            </div>

                            {selectedAccount && (
                                <div className={`rounded-2xl border px-4 py-3 ${isBuyFundsEnough ? 'border-emerald-100 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/80'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Preview Dana</p>
                                            <p className="mt-1 text-sm font-bold text-slate-900">{selectedAccount.name}</p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${isBuyFundsEnough ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {form.side === 'BUY'
                                                ? (tradePreview ? (isBuyFundsEnough ? 'Dana Cukup' : 'Dana Kurang') : 'Isi Dulu')
                                                : 'Info Sell'}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                                        <div className="rounded-xl bg-white/80 px-3 py-2">
                                            <p className="font-bold uppercase tracking-widest text-slate-400">Saldo Tersedia</p>
                                            <p className="mt-1 font-bold text-slate-900">{formatCurrency(availableCash)}</p>
                                        </div>
                                        <div className="rounded-xl bg-white/80 px-3 py-2">
                                            <p className="font-bold uppercase tracking-widest text-slate-400">
                                                {form.side === 'BUY' ? 'Butuh Netto' : 'Estimasi Netto'}
                                            </p>
                                            <p className="mt-1 font-bold text-slate-900">{formatCurrency(Number(tradePreview?.netValue || 0))}</p>
                                        </div>
                                        <div className="rounded-xl bg-white/80 px-3 py-2">
                                            <p className="font-bold uppercase tracking-widest text-slate-400">Nilai Bruto</p>
                                            <p className="mt-1 font-bold text-slate-900">{formatCurrency(Number(tradePreview?.grossValue || 0))}</p>
                                        </div>
                                        <div className="rounded-xl bg-white/80 px-3 py-2">
                                            <p className="font-bold uppercase tracking-widest text-slate-400">Total Fee</p>
                                            <p className="mt-1 font-bold text-slate-900">
                                                {formatCurrency(Number(tradePreview?.brokerFee || 0) + Number(tradePreview?.levyFee || 0))}
                                            </p>
                                        </div>
                                    </div>

                                    {form.side === 'BUY' && tradePreview ? (
                                        <p className={`mt-3 text-[11px] font-semibold ${isBuyFundsEnough ? 'text-emerald-700' : 'text-rose-700'}`}>
                                            {isBuyFundsEnough
                                                ? `Sisa saldo setelah BUY sekitar ${formatCurrency(Math.max(0, Number(remainingCashAfterBuy || 0)))}.`
                                                : `Saldo kurang sekitar ${formatCurrency(Math.abs(Number(remainingCashAfterBuy || 0)))}. Tambahkan dana ke RDN dulu.`}
                                        </p>
                                    ) : null}
                                    {selectedOwner && (
                                        <p className="mt-2 text-[11px] font-medium text-slate-500">
                                            Saldo yang dipakai adalah milik {selectedOwner.name} pada akun ini.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Trade date */}
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal Transaksi</span>
                                <input
                                    type="date"
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={form.tradedAt}
                                    onChange={(e) => setForm((current) => ({ ...current, tradedAt: e.target.value }))}
                                />
                            </label>

                            {/* Notes */}
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Catatan Tambahan (Opsional)</span>
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm min-h-[96px] bg-slate-50 font-medium resize-none"
                                    placeholder="Tuliskan alasan beli/jual..."
                                    value={form.notes}
                                    onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                                />
                            </label>

                            {/* Submit */}
                            {isSubmitBlockedByFunds && (
                                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                    <p className="text-[11px] font-semibold text-rose-700">
                                        Dana di rekening saham belum cukup untuk transaksi BUY ini. Tambahkan dana ke RDN/sekuritas dulu, lalu simpan ulang.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleOpenTopUpRdn}
                                        className="mt-3 inline-flex h-10 items-center justify-center rounded-2xl bg-rose-600 px-4 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-rose-500"
                                    >
                                        Top Up RDN Ini
                                    </button>
                                </div>
                            )}
                            <button
                                ref={submitButtonRef}
                                disabled={saving || availableStockAccounts.length === 0 || isSubmitBlockedByFunds}
                                className="w-full rounded-2xl bg-blue-600 h-12 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-all hover:bg-blue-500"
                            >
                                {editingId ? <Save size={16} /> : <Plus size={16} />}
                                {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Tambah Transaksi'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Stocks;
