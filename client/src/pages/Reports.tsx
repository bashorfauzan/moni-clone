import { useState, useEffect, useRef, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts';
import {
    ChevronRight, ChevronLeft, ChevronDown,
    Download, Pencil, Trash2, CheckCircle2, Info,
} from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import {
    createTransaction, fetchTransactions,
    type TransactionItem, bulkDeleteTransactions,
} from '../services/transactions';
import { fetchStockTransactions } from '../services/stocks';
import { fetchIpoOrders } from '../services/stocksIpo';
import { useSecurity } from '../context/SecurityContext';
import Spinner from '../components/Spinner';
import { getErrorMessage } from '../services/errors';
import { downloadBackupBlob } from '../services/backup';
import {
    isInvestmentLiquidation,
    isInvestmentTransfer,
    isTopUpLikeTransfer,
    normalizeTransactionType,
} from '../lib/transactionRules';

// ─── Category icon map ────────────────────────────────────────────────────────
const ICON_MAP: Record<string, { emoji: string; color: string; bg: string }> = {
    'Transfer':               { emoji: '⇄',  color: '#f97316', bg: '#fff7ed' },
    'Withdraw':               { emoji: '↑',  color: '#9333ea', bg: '#faf5ff' },
    'Income':                 { emoji: '↓',  color: '#16a34a', bg: '#f0fdf4' },
    'Expense':                { emoji: '⬆',  color: '#dc2626', bg: '#fef2f2' },
    'Lainnya':                { emoji: '···', color: '#6366f1', bg: '#eef2ff' },
    'Gaji UMM':               { emoji: '💼', color: '#0d9488', bg: '#f0fdfa' },
    'THR':                    { emoji: '🎁', color: '#d97706', bg: '#fffbeb' },
    'Tabungan':               { emoji: '🏦', color: '#2563eb', bg: '#eff6ff' },
    'Tabungan Kaltim':        { emoji: '🏦', color: '#2563eb', bg: '#eff6ff' },
    'Zakat':                  { emoji: '☾',  color: '#16a34a', bg: '#f0fdf4' },
    'Sangu':                  { emoji: '💝', color: '#ec4899', bg: '#fdf2f8' },
    'Setoran Investasi':      { emoji: '📈', color: '#7c3aed', bg: '#f5f3ff' },
    'Pencairan Investasi':    { emoji: '📉', color: '#be185d', bg: '#fdf2f8' },
    'Pengantaran':            { emoji: '🚗', color: '#0284c7', bg: '#f0f9ff' },
    'Gaji 13':                { emoji: '💰', color: '#15803d', bg: '#f0fdf4' },
    'Buka Tabungan':          { emoji: '🏦', color: '#2563eb', bg: '#eff6ff' },
    'km genap ke-1':          { emoji: '📋', color: '#64748b', bg: '#f8fafc' },
    'Lab':                    { emoji: '🔬', color: '#0891b2', bg: '#ecfeff' },
    'Penelitian tahap 2':     { emoji: '🔬', color: '#0891b2', bg: '#ecfeff' },
    'Hardiknas':              { emoji: '🎓', color: '#7c3aed', bg: '#f5f3ff' },
    'HR Wali':                { emoji: '👨‍🏫', color: '#d97706', bg: '#fffbeb' },
    'HR koreksi UAS':         { emoji: '📝', color: '#64748b', bg: '#f8fafc' },
};

const getIconConf = (name: string) =>
    ICON_MAP[name] ?? {
        emoji: name ? name.charAt(0).toUpperCase() : '?',
        color: '#2563eb',
        bg: '#eff6ff',
    };

// ─── Color palettes ───────────────────────────────────────────────────────────
const INCOME_COLORS  = ['#f5a623', '#2563eb', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b'];
const EXPENSE_COLORS = ['#c0392b', '#9b59b6', '#e67e22', '#e91e63', '#1565c0', '#2e7d32', '#ad1457'];

// ─── Transaction kind helpers ─────────────────────────────────────────────────
const getKind = (tx: TransactionItem) => {
    if (isInvestmentTransfer(tx))    return 'INVESTMENT_TOP_UP';
    if (isInvestmentLiquidation(tx)) return 'INVESTMENT_LIQUIDATION';
    if (isTopUpLikeTransfer(tx))     return 'TOP_UP';
    return normalizeTransactionType(tx.type) || tx.type;
};

type ModalType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'TOP_UP' | 'INVESTMENT';

const getModalType = (tx: TransactionItem): ModalType => {
    if (isInvestmentTransfer(tx) || isInvestmentLiquidation(tx)) return 'INVESTMENT';
    const k = normalizeTransactionType(tx.type);
    if (k === 'INCOME')   return 'INCOME';
    if (k === 'EXPENSE')  return 'EXPENSE';
    if (k === 'TRANSFER') return 'TRANSFER';
    return 'INCOME';
};

const getAmountColor = (tx: TransactionItem) => {
    const k = getKind(tx);
    if (k === 'INCOME' || k === 'INVESTMENT_LIQUIDATION') return 'text-emerald-600';
    if (k === 'EXPENSE' || k === 'INVESTMENT_TOP_UP')     return 'text-rose-600';
    return 'text-slate-700';
};

// ─── Category aggregation ─────────────────────────────────────────────────────
type CatEntry = {
    name: string;
    amount: number;
    percent: number;
    transactions: TransactionItem[];
};

const aggregate = (txs: TransactionItem[], keyFn: (tx: TransactionItem) => string, total: number): CatEntry[] => {
    const map: Record<string, { transactions: TransactionItem[]; amount: number }> = {};
    txs.forEach(tx => {
        const k = keyFn(tx) || 'Lainnya';
        if (!map[k]) map[k] = { transactions: [], amount: 0 };
        map[k].transactions.push(tx);
        map[k].amount += tx.amount;
    });
    return Object.entries(map)
        .map(([name, { transactions, amount }]) => ({
            name,
            amount,
            percent: total > 0 ? Math.round((amount / total) * 100) : 0,
            transactions,
        }))
        .sort((a, b) => b.amount - a.amount);
};

// ─── Component ────────────────────────────────────────────────────────────────
const Reports = () => {
    const { openEditModal } = useTransaction();
    const { verifySecurity } = useSecurity();

    // Period
    const [currentDate, setCurrentDate] = useState(new Date());

    // Remote data
    const [allTransactions, setAllTransactions] = useState<TransactionItem[]>([]);
    const [loading, setLoading]   = useState(true);
    const [exporting, setExporting] = useState(false);

    // Selection / deletion
    const [selectedTx, setSelectedTx]               = useState<Set<string>>(new Set());
    const [lastDeleted, setLastDeleted]              = useState<TransactionItem[]>([]);
    const [restoringDelete, setRestoringDelete]      = useState(false);
    const longPressTimerRef                          = useRef<number | null>(null);
    const longPressTriggeredRef                      = useRef(false);

    // Cashflow UI navigation
    const [cashflowTab, setCashflowTab] = useState<'INCOME' | 'EXPENSE'>('INCOME');
    const [drillLevel,  setDrillLevel]  = useState(0);   // 0=L1 list, 1=L2 list, 2=L3 txns
    const [selectedL1,  setSelectedL1]  = useState<string | null>(null);
    const [selectedL2,  setSelectedL2]  = useState<string | null>(null);

    // ─ Month options (last 24 months) ─
    const monthOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [];
        const now = new Date();
        for (let i = 0; i <= 23; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            opts.push({
                value: `${d.getFullYear()}-${d.getMonth()}`,
                label: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
            });
        }
        return opts;
    }, []);

    // ─ Format helpers ─
    const fmtCurrency = (val: number) =>
        new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR',
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(val).replace('Rp', 'Rp ');

    const fmtNumber = (val: number) =>
        new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

    // ─ Fetch ─
    const fetchData = async () => {
        setLoading(true);
        try {
            const txs = await fetchTransactions({ validated: true });
            const filtered = (txs as TransactionItem[]).filter(tx => {
                const d = new Date(tx.date);
                return d.getMonth() === currentDate.getMonth()
                    && d.getFullYear() === currentDate.getFullYear();
            });
            setAllTransactions(
                filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            );
        } catch (e) {
            console.error('Error fetching reports:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchData(); }, [currentDate]);

    useEffect(() => {
        const h = () => void fetchData();
        window.addEventListener('nova:data-changed', h);
        return () => {
            window.removeEventListener('nova:data-changed', h);
            clearLongPress();
        };
    }, [currentDate]);

    // ─ Long-press ─
    const clearLongPress = () => {
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const startLongPress = (id: string) => {
        clearLongPress();
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTriggeredRef.current = true;
            setSelectedTx(prev => { const n = new Set(prev); n.add(id); return n; });
        }, 450);
    };

    const handleTxPress = (tx: TransactionItem) => {
        if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return; }
        if (selectedTx.size > 0) {
            setSelectedTx(prev => {
                const n = new Set(prev);
                n.has(tx.id) ? n.delete(tx.id) : n.add(tx.id);
                return n;
            });
            return;
        }
        openEditModal(tx.id, getModalType(tx), {
            amount: tx.amount,
            description: tx.description || tx.activity?.name,
            ownerId: tx.ownerId,
            activityId: tx.activityId,
            sourceAccountId: tx.sourceAccountId,
            destinationAccountId: tx.destinationAccountId,
        });
    };

    // ─ Bulk delete ─
    const handleBulkDelete = async () => {
        if (!selectedTx.size) return;
        const ok = await verifySecurity(`Hapus ${selectedTx.size} Transaksi`);
        if (!ok) return;
        try {
            const snap = allTransactions.filter(tx => selectedTx.has(tx.id));
            await bulkDeleteTransactions(Array.from(selectedTx));
            setLastDeleted(snap);
            setSelectedTx(new Set());
            await fetchData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (err: any) {
            alert(getErrorMessage(err, 'Gagal menghapus transaksi'));
        }
    };

    const handleUndoDelete = async () => {
        if (!lastDeleted.length || restoringDelete) return;
        setRestoringDelete(true);
        try {
            const sorted = [...lastDeleted].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            for (const tx of sorted) {
                await createTransaction({
                    amount: tx.amount,
                    description: tx.description || tx.activity?.name,
                    ownerId: tx.ownerId || '',
                    type: normalizeTransactionType(tx.type) || 'INCOME',
                    sourceAccountId: tx.sourceAccountId,
                    destinationAccountId: tx.destinationAccountId,
                    activityId: tx.activityId,
                    date: tx.date,
                });
            }
            setLastDeleted([]);
            await fetchData();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (err: any) {
            alert(getErrorMessage(err, 'Gagal memulihkan transaksi'));
        } finally {
            setRestoringDelete(false);
        }
    };

    // ─ Export ─
    const exportExcel = async () => {
        setExporting(true);
        try {
            const XLSX = await import('xlsx');
            const now   = new Date();
            const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}.${String(now.getMinutes()).padStart(2,'0')}`;

            const [stockTxs, ipoOrders] = await Promise.all([fetchStockTransactions(), fetchIpoOrders()]);
            const wb = XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
                allTransactions.map((tx, i) => ({
                    No: i + 1,
                    Tanggal: new Date(tx.date).toLocaleDateString('id-ID'),
                    Tipe: tx.type,
                    Pemilik: tx.owner?.name || '-',
                    Kategori: tx.activity?.name || '-',
                    Nominal: tx.amount,
                    Catatan: tx.description || '-',
                }))
            ), 'Transaksi');

            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
                stockTxs.length > 0
                    ? stockTxs.map((tx, i) => ({
                        No: i + 1, Tanggal: new Date(tx.tradedAt).toLocaleDateString('id-ID'),
                        Ticker: tx.ticker, Aksi: tx.side, Lot: tx.lot,
                        'Harga/Lembar': tx.pricePerShare, 'Nilai Bruto': tx.grossValue,
                        'Fee Broker': tx.brokerFee, 'Nilai Netto': tx.netValue,
                    }))
                    : [{ Keterangan: 'Belum ada data' }]
            ), 'Saham');

            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
                ipoOrders.length > 0
                    ? ipoOrders.map((o, i) => ({
                        No: i + 1, Ticker: o.ticker, Status: o.status,
                        'Harga IPO': o.ipoPrice, 'Lot Pesan': o.lotRequested,
                        'Lot Jatah': o.lotAllocated,
                    }))
                    : [{ Keterangan: 'Belum ada data' }]
            ), 'IPO');

            const out  = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            downloadBackupBlob(blob, `Cashflow ${label}.xlsx`);
        } catch (err: any) {
            alert(getErrorMessage(err, 'Gagal export data'));
        } finally {
            setExporting(false);
        }
    };

    // ─ Cashflow computed data ─────────────────────────────────────────────────
    const tabTxs = useMemo(() =>
        allTransactions.filter(tx => {
            const k = getKind(tx);
            return cashflowTab === 'INCOME'
                ? ['INCOME', 'INVESTMENT_LIQUIDATION', 'INVESTMENT_IN'].includes(k)
                : ['EXPENSE', 'INVESTMENT_TOP_UP', 'INVESTMENT_OUT', 'TRANSFER', 'TOP_UP'].includes(k);
        }),
        [allTransactions, cashflowTab]
    );

    const tabTotal = useMemo(() =>
        tabTxs.reduce((s, tx) => s + tx.amount, 0),
        [tabTxs]
    );

    const l1Cats = useMemo(() =>
        aggregate(tabTxs, tx => tx.activity?.name || 'Lainnya', tabTotal),
        [tabTxs, tabTotal]
    );

    const l1Selected = useMemo(() =>
        l1Cats.find(c => c.name === selectedL1),
        [l1Cats, selectedL1]
    );

    const l2Cats = useMemo(() => {
        if (!l1Selected) return [] as CatEntry[];
        return aggregate(l1Selected.transactions, tx => tx.description || 'Lainnya', l1Selected.amount);
    }, [l1Selected]);

    const l2Selected = useMemo(() =>
        l2Cats.find(c => c.name === selectedL2),
        [l2Cats, selectedL2]
    );

    const l3Txs = useMemo(() =>
        (l2Selected?.transactions ?? [])
            .slice()
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [l2Selected]
    );

    // Donut
    const donutData = useMemo(() => {
        if (drillLevel === 0) return l1Cats.map(c => ({ name: c.name, value: c.amount }));
        if (drillLevel === 1) return l2Cats.map(c => ({ name: c.name, value: c.amount }));
        return [];
    }, [drillLevel, l1Cats, l2Cats]);

    const donutLabel  = drillLevel === 0
        ? (cashflowTab === 'INCOME' ? 'Total\nPemasukan' : 'Total\nPengeluaran')
        : (selectedL1 ?? '');

    const donutAmount = drillLevel === 0 ? tabTotal : (l1Selected?.amount ?? 0);
    const donutColors = cashflowTab === 'INCOME' ? INCOME_COLORS : EXPENSE_COLORS;

    // ─ Navigation ─
    const goBack = () => {
        if (drillLevel === 2) { setDrillLevel(1); setSelectedL2(null); }
        else if (drillLevel === 1) { setDrillLevel(0); setSelectedL1(null); }
    };

    const handleMonthChange = (val: string) => {
        const [y, m] = val.split('-').map(Number);
        setCurrentDate(new Date(y, m, 1));
        setDrillLevel(0); setSelectedL1(null); setSelectedL2(null);
    };

    const switchTab = (tab: 'INCOME' | 'EXPENSE') => {
        setCashflowTab(tab);
        setDrillLevel(0); setSelectedL1(null); setSelectedL2(null);
    };

    if (loading) return <Spinner message="Menganalisis Cashflow..." />;

    // ─── Category row renderer ────────────────────────────────────────────────
    const CategoryRow = ({
        name, amount, percent, colorIndex, onClick,
    }: {
        name: string; amount: number; percent: number; colorIndex: number; onClick: () => void;
    }) => {
        const ic = getIconConf(name);
        return (
            <button
                onClick={onClick}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50/80 active:bg-slate-100"
            >
                <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
                    style={{ backgroundColor: ic.bg, color: ic.color }}
                >
                    {ic.emoji}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: '#1a3d6b' }}>{name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                        IDR {fmtNumber(amount)}
                        {percent > 0 && (
                            <span
                                className="ml-2 font-bold"
                                style={{ color: donutColors[colorIndex % donutColors.length] }}
                            >
                                {percent}%
                            </span>
                        )}
                    </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-300" />
            </button>
        );
    };

    // ─── Sub-header (drill-down breadcrumb) ───────────────────────────────────
    const DrillHeader = ({ label }: { label: string }) => {
        const ic = getIconConf(label);
        return (
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5">
                <button onClick={goBack} className="shrink-0 text-slate-400 hover:text-slate-600">
                    <ChevronLeft size={20} />
                </button>
                <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                    style={{ backgroundColor: ic.bg, color: ic.color }}
                >
                    {ic.emoji}
                </div>
                <p className="truncate text-sm font-bold" style={{ color: '#1a3d6b' }}>{label}</p>
            </div>
        );
    };

    // ─── Transaction row (L3) ─────────────────────────────────────────────────
    const TxRow = ({ tx }: { tx: TransactionItem }) => {
        const isSelected = selectedTx.has(tx.id);
        const d       = new Date(tx.date);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        return (
            <div
                className={`flex items-start gap-3 border-b border-slate-100 px-5 py-4 transition-colors ${
                    isSelected ? 'bg-rose-50 shadow-[inset_4px_0_0_#dc2626]' : 'hover:bg-slate-50'
                }`}
                onTouchStart={() => startLongPress(tx.id)}
                onTouchEnd={clearLongPress}
                onTouchCancel={clearLongPress}
                onMouseDown={() => startLongPress(tx.id)}
                onMouseUp={clearLongPress}
                onMouseLeave={clearLongPress}
                onClick={() => handleTxPress(tx)}
            >
                {/* Date */}
                <div className="w-9 shrink-0 pt-0.5 text-center">
                    <p className="text-[11px] font-bold text-slate-400">{dateStr}</p>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold" style={{ color: '#1a3d6b' }}>
                        {tx.description || tx.activity?.name || 'Transaksi'}
                    </p>
                    <p className={`mt-0.5 text-sm font-bold ${getAmountColor(tx)}`}>
                        IDR {fmtNumber(tx.amount)}
                    </p>
                    {tx.owner?.name && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {tx.owner.name}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1.5">
                    {isSelected && <CheckCircle2 size={16} className="text-rose-600" />}
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            openEditModal(tx.id, getModalType(tx), {
                                amount: tx.amount,
                                description: tx.description || tx.activity?.name,
                                ownerId: tx.ownerId,
                                activityId: tx.activityId,
                                sourceAccountId: tx.sourceAccountId,
                                destinationAccountId: tx.destinationAccountId,
                            });
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                    >
                        <Pencil size={12} />
                    </button>
                </div>
            </div>
        );
    };

    // ─── Main render ──────────────────────────────────────────────────────────
    return (
        <div className="mx-auto w-full max-w-2xl pb-32">

            {/* ═══ Blue header ═══ */}
            <div style={{ backgroundColor: '#1a3d6b' }}>
                {/* Top bar */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    {drillLevel > 0
                        ? (
                            <button
                                onClick={goBack}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )
                        : <div className="w-8" />
                    }
                    <h1 className="text-base font-bold tracking-wide text-white">Cashflow</h1>
                    <button
                        onClick={exportExcel}
                        disabled={exporting}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                        title="Export Excel"
                    >
                        {exporting
                            ? <span className="text-[10px] font-black">...</span>
                            : <Download size={15} />
                        }
                    </button>
                </div>

                {/* Tab bar — only at root level */}
                {drillLevel === 0 && (
                    <div className="flex px-2 pb-0">
                        {(['EXPENSE', 'INCOME'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => switchTab(tab)}
                                className={`flex-1 border-b-2 py-3 text-sm font-semibold transition-all ${
                                    cashflowTab === tab
                                        ? 'border-white text-white'
                                        : 'border-transparent text-white/40 hover:text-white/65'
                                }`}
                            >
                                {tab === 'EXPENSE' ? 'Pengeluaran' : 'Pemasukan'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ White body ═══ */}
            <div className="bg-white min-h-screen">

                {/* Month dropdown */}
                <div className="px-4 pt-4 pb-2">
                    <div className="relative">
                        <select
                            value={`${currentDate.getFullYear()}-${currentDate.getMonth()}`}
                            onChange={e => handleMonthChange(e.target.value)}
                            className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-700 transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                            {monthOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <ChevronDown
                            size={16}
                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                    </div>
                </div>

                {/* Donut chart (L0 & L1 only) */}
                {drillLevel < 2 && (
                    donutData.length > 0 ? (
                        <div className="relative mx-auto my-2 h-56 w-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="60%"
                                        outerRadius="84%"
                                        paddingAngle={donutData.length > 1 ? 2 : 0}
                                        dataKey="value"
                                        startAngle={90}
                                        endAngle={-270}
                                        strokeWidth={0}
                                    >
                                        {donutData.map((_, i) => (
                                            <Cell key={i} fill={donutColors[i % donutColors.length]} />
                                        ))}
                                    </Pie>
                                    <ChartTooltip
                                        formatter={(val) => fmtCurrency(Number(val))}
                                        contentStyle={{
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            border: '1px solid #e2e8f0',
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Center label */}
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                                <p className="whitespace-pre-line text-[11px] leading-snug text-slate-400">
                                    {donutLabel}
                                </p>
                                <p className="mt-2 text-[11px] font-semibold text-slate-400">IDR</p>
                                <p className="text-lg font-black leading-tight text-slate-900">
                                    {fmtNumber(donutAmount)}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-56 items-center justify-center">
                            <p className="text-sm text-slate-400">Tidak ada data periode ini</p>
                        </div>
                    )
                )}

                {/* Info banner */}
                <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3">
                    <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: '#1a3d6b' }}
                    >
                        <Info size={14} className="text-white" />
                    </div>
                    <p className="text-xs font-semibold" style={{ color: '#1a3d6b' }}>
                        Tentang Catatan Keuangan — Cashflow
                    </p>
                </div>

                {/* Undo delete banner */}
                {lastDeleted.length > 0 && (
                    <div className="mx-4 mb-3 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold text-amber-800">
                            {lastDeleted.length} transaksi siap dipulihkan
                        </p>
                        <button
                            onClick={handleUndoDelete}
                            disabled={restoringDelete}
                            className="rounded-full bg-amber-500 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
                        >
                            {restoringDelete ? 'Memulihkan...' : 'Undo Hapus'}
                        </button>
                    </div>
                )}

                {/* Bulk delete bar */}
                {selectedTx.size > 0 && (
                    <div className="sticky top-0 z-10 mx-4 mb-3 flex items-center justify-between rounded-2xl bg-rose-600 px-4 py-2.5 shadow-lg">
                        <span className="text-xs font-bold text-white">{selectedTx.size} dipilih</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSelectedTx(new Set())}
                                className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold text-white hover:bg-white/30"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50"
                            >
                                <Trash2 size={11} /> Hapus ({selectedTx.size})
                            </button>
                        </div>
                    </div>
                )}

                {/* ════ Level 0 — L1 Category list ════ */}
                {drillLevel === 0 && (
                    <div>
                        <div className="border-b border-slate-200 px-5 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Kategori
                            </p>
                        </div>
                        {l1Cats.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-sm text-slate-400">Tidak ada transaksi pada periode ini</p>
                            </div>
                        ) : (
                            l1Cats.map((cat, i) => (
                                <CategoryRow
                                    key={cat.name}
                                    name={cat.name}
                                    amount={cat.amount}
                                    percent={cat.percent}
                                    colorIndex={i}
                                    onClick={() => { setSelectedL1(cat.name); setDrillLevel(1); }}
                                />
                            ))
                        )}
                    </div>
                )}

                {/* ════ Level 1 — L2 Sub-category list ════ */}
                {drillLevel === 1 && (
                    <div>
                        <DrillHeader label={selectedL1 ?? ''} />
                        {l2Cats.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-sm text-slate-400">Tidak ada sub-kategori</p>
                            </div>
                        ) : (
                            l2Cats.map((cat, i) => (
                                <CategoryRow
                                    key={cat.name}
                                    name={cat.name}
                                    amount={cat.amount}
                                    percent={cat.percent}
                                    colorIndex={i}
                                    onClick={() => { setSelectedL2(cat.name); setDrillLevel(2); }}
                                />
                            ))
                        )}
                    </div>
                )}

                {/* ════ Level 2 — L3 Transaction list ════ */}
                {drillLevel === 2 && (
                    <div>
                        <DrillHeader label={selectedL2 ?? ''} />

                        {/* Selected L2 summary */}
                        {l2Selected && (
                            <div className="border-b border-slate-100 px-5 py-3">
                                <p className="text-xs text-slate-500">
                                    Total:{' '}
                                    <span className="font-bold text-slate-800">
                                        {fmtCurrency(l2Selected.amount)}
                                    </span>
                                    <span className="ml-2 text-[11px] font-semibold" style={{ color: donutColors[0] }}>
                                        {l2Selected.percent}% dari {selectedL1}
                                    </span>
                                </p>
                            </div>
                        )}

                        {l3Txs.length === 0 ? (
                            <div className="py-20 text-center">
                                <p className="text-sm text-slate-400">Tidak ada transaksi</p>
                            </div>
                        ) : (
                            l3Txs.map(tx => <TxRow key={tx.id} tx={tx} />)
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};

export default Reports;
