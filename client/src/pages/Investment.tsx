import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ArrowRightLeft, X, Save, Pencil, Trash2, Download, History, Plus, Wallet, BarChart2 } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { createInvestmentIncome, createTransaction, deleteTransaction, fetchTransactions, updateInvestmentIncome } from '../services/transactions';
import { getErrorMessage } from '../services/errors';
import { fetchStockPositions, fetchStockTransactions, type StockPosition } from '../services/stocks';
import { fetchIpoOrders, type IpoOrder } from '../services/stocksIpo';
import { downloadBackupBlob } from '../services/backup';
import { Link, useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import {
    isInvestmentIncome,
    isInvestmentTransfer,
    normalizeTransactionType,
    shouldHideLegacyInvestmentTransactionType
} from '../lib/transactionRules';

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(val);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');
const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
};

const summarizeFlows = (transactions: any[], accountId: string) => {
    let modal = 0;
    let currentValue = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    let incomeCount = 0;

    transactions.forEach((tx) => {
        if (isInvestmentTransfer(tx) && tx.destinationAccountId === accountId) {
            modal += tx.amount;
            currentValue += tx.amount;
            depositCount += 1;
        }

        if (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccountId === accountId) {
            modal -= tx.amount;
            currentValue -= tx.amount;
            withdrawalCount += 1;
        }

        if (isInvestmentIncome(tx) && tx.destinationAccountId === accountId) {
            currentValue += tx.amount;
            incomeCount += 1;
        }
    });

    return { modal, currentValue, depositCount, withdrawalCount, incomeCount };
};

const getInvestmentFlowLabel = (tx: any, accountId: string) => {
    if (isInvestmentTransfer(tx) && tx.destinationAccountId === accountId) return 'Setoran Modal';
    if (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccountId === accountId) return 'Pencairan';
    if (isInvestmentIncome(tx) && tx.destinationAccountId === accountId) return 'Hasil Investasi';
    return 'Investasi';
};

const getInvestmentFlowTone = (tx: any, accountId: string) => {
    if (isInvestmentTransfer(tx) && tx.destinationAccountId === accountId) return 'bg-blue-50 text-blue-600';
    if (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccountId === accountId) return 'bg-amber-50 text-amber-600';
    if (isInvestmentIncome(tx) && tx.destinationAccountId === accountId) return 'bg-emerald-50 text-emerald-600';
    return 'bg-slate-100 text-slate-500';
};

const getPendingIpoReservedValue = (orders: IpoOrder[], accountId: string) =>
    orders
        .filter((order) => order.accountId === accountId && order.status === 'PESAN')
        .reduce((sum, order) => sum + (Number(order.lotRequested || 0) * 100 * Number(order.ipoPrice || 0)), 0);

const Investment = () => {
    const navigate = useNavigate();
    const [rdnAccounts, setRdnAccounts] = useState<any[]>([]);
    const [investmentIncomeAccounts, setInvestmentIncomeAccounts] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [owners, setOwners] = useState<any[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [stockPositions, setStockPositions] = useState<StockPosition[]>([]);
    const [ipoOrders, setIpoOrders] = useState<IpoOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');
    const [selectedRdnId, setSelectedRdnId] = useState('ALL');

    // Modals
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [fabOpen, setFabOpen] = useState(false);
    const [selectedRdn, setSelectedRdn] = useState<any>(null);
    const [detailAccount, setDetailAccount] = useState<any | null>(null);
    const [historyAccount, setHistoryAccount] = useState<any | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [incomeFormLock, setIncomeFormLock] = useState<{ ownerId: string; accountId: string; active: boolean }>({
        ownerId: '',
        accountId: '',
        active: false
    });
    const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);

    // Forms
    const [transferForm, setTransferForm] = useState({
        type: 'DEPOSIT', // DEPOSIT (Bank -> RDN) or WITHDRAW (RDN -> Bank)
        bankId: '',
        ownerId: '',
        amount: ''
    });

    const [incomeForm, setIncomeForm] = useState({
        kind: 'SUKUK',
        ownerId: '',
        accountId: '',
        amount: '',
        description: 'Pendapatan sukuk triwulan',
        date: new Date().toISOString().slice(0, 10)
    });
    const [stockGrowthDirection, setStockGrowthDirection] = useState<'UP' | 'DOWN'>('UP');
    const [activeAmountField, setActiveAmountField] = useState<'income' | 'transfer' | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const ownerFilter = selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined;
            const [metaRes, txRes, stockPositionRes, ipoOrderRes] = await Promise.all([
                fetchMasterMeta(),
                fetchTransactions(),
                fetchStockPositions({
                    ownerId: ownerFilter,
                    groupByAccount: true
                }),
                fetchIpoOrders({
                    ownerId: ownerFilter
                })
            ]);

            setOwners(metaRes.owners || []);
            setActivities(metaRes.activities || []);

            const rdns = metaRes.accounts.filter((acc: any) => acc.type === 'RDN');
            const investmentAccounts = metaRes.accounts.filter((acc: any) => acc.type === 'RDN' || acc.type === 'Sekuritas');
            const banks = metaRes.accounts.filter((acc: any) => acc.type === 'Bank' || acc.type === 'E-Wallet');
            setRdnAccounts(rdns);
            setInvestmentIncomeAccounts(investmentAccounts);
            setBankAccounts(banks);

            // Required to calculate accurate Modal 
            // Modal = sum(Transfer IN) - sum(Transfer OUT)
            setTransactions(txRes);
            setStockPositions(stockPositionRes);
            setIpoOrders(ipoOrderRes);
            setIncomeForm((prev) => ({
                ...prev,
                ownerId: prev.ownerId || metaRes.owners[0]?.id || '',
                accountId: prev.accountId || investmentAccounts[0]?.id || ''
            }));

        } catch (error) {
            console.error('Error fetching investment data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, [selectedOwnerId]);

    // Derived Metrics
    const validatedTransactions = transactions.filter((tx: any) => tx.isValidated && !shouldHideLegacyInvestmentTransactionType(tx.type));
    const scopedTransactions = selectedOwnerId === 'ALL'
        ? validatedTransactions
        : validatedTransactions.filter((tx: any) => tx.ownerId === selectedOwnerId);
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const nextMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const monthlyInvestmentTransactions = scopedTransactions.filter((tx: any) => {
        const txDate = new Date(tx.date);
        return txDate >= currentMonthStart && txDate < nextMonthStart;
    });

    const filteredRdns = rdnAccounts;

    const portfolioData = filteredRdns.map((rdn) => {
        const summary = summarizeFlows(scopedTransactions, rdn.id);
        const accountStockPositions = stockPositions.filter((position) => position.accountId === rdn.id);
        const stockHoldingValue = accountStockPositions.reduce((sum, position) => sum + Number(position.totalCost || 0), 0);
        const pendingIpoValue = getPendingIpoReservedValue(ipoOrders, rdn.id);
        const cashBalance = Number(rdn.balance || 0);
        const ecosystemValue = cashBalance + stockHoldingValue;
        const availableCash = cashBalance - pendingIpoValue;
        const returnAmount = ecosystemValue - summary.modal;
        const returnPercent = summary.modal > 0 ? (returnAmount / summary.modal) * 100 : 0;

        return {
            ...rdn,
            balance: ecosystemValue,
            cashBalance,
            stockHoldingValue,
            pendingIpoValue,
            availableCash,
            modal: summary.modal,
            returnAmount,
            returnPercent,
            depositCount: summary.depositCount,
            withdrawalCount: summary.withdrawalCount,
            incomeCount: summary.incomeCount,
            stockPositionCount: accountStockPositions.length
        };
    }).filter((rdn) => Math.abs(Number(rdn.balance || 0)) > 0 || Math.abs(rdn.modal) > 0)
        .filter((rdn) => selectedRdnId === 'ALL' || rdn.id === selectedRdnId);

    const totalValue = portfolioData.reduce((sum, rdn) => sum + Math.abs(Number(rdn.balance || 0)), 0);
    const totalModal = portfolioData.reduce((sum, rdn) => sum + Number(rdn.modal || 0), 0);
    const totalReturnAmount = totalValue - totalModal;
    const totalReturnPercent = totalModal > 0 ? (totalReturnAmount / totalModal) * 100 : 0;
    const totalDepositCount = portfolioData.reduce((sum, rdn) => sum + Number(rdn.depositCount || 0), 0);
    const monthlyInvestmentSnapshot = monthlyInvestmentTransactions.reduce((acc, tx: any) => {
        if (isInvestmentTransfer(tx)) {
            acc.deposit += tx.amount;
            acc.depositCount += 1;
        } else if (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccount?.type === 'RDN') {
            acc.withdrawal += tx.amount;
            acc.withdrawalCount += 1;
        } else if (isInvestmentIncome(tx)) {
            acc.income += tx.amount;
            acc.incomeCount += 1;
        }
        return acc;
    }, {
        deposit: 0,
        income: 0,
        withdrawal: 0,
        depositCount: 0,
        incomeCount: 0,
        withdrawalCount: 0
    });
    const ownershipRows = detailAccount
        ? owners
            .map((owner) => {
                const ownerTransactions = validatedTransactions.filter((tx: any) => tx.ownerId === owner.id);
                const summary = summarizeFlows(ownerTransactions, detailAccount.id);

                return {
                    ownerId: owner.id,
                    name: owner.name,
                    amount: summary.currentValue,
                    depositCount: summary.depositCount,
                    withdrawalCount: summary.withdrawalCount,
                    incomeCount: summary.incomeCount
                };
            })
            .filter((row) => row.amount !== 0 || row.depositCount > 0 || row.incomeCount > 0)
            .sort((a, b) => b.amount - a.amount)
        : [];

    const selectedOwnerName = selectedOwnerId === 'ALL'
        ? 'semua kepemilikan'
        : owners.find((owner) => owner.id === selectedOwnerId)?.name || 'kepemilikan terpilih';

    const detailAccountSummary = detailAccount
        ? {
            ...summarizeFlows(scopedTransactions, detailAccount.id),
            cashBalance: Number(detailAccount.balance || 0),
            stockHoldingValue: stockPositions
                .filter((position) => position.accountId === detailAccount.id)
                .reduce((sum, position) => sum + Number(position.totalCost || 0), 0),
            pendingIpoValue: getPendingIpoReservedValue(ipoOrders, detailAccount.id)
        }
        : null;
    const historyAccountTransactions = historyAccount
        ? scopedTransactions
            .filter((tx: any) =>
                (isInvestmentTransfer(tx) && tx.destinationAccountId === historyAccount.id)
                || (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccountId === historyAccount.id)
                || (isInvestmentIncome(tx) && tx.destinationAccountId === historyAccount.id)
            )
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10)
        : [];

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transferForm.ownerId) {
            alert('Pilih kepemilikan terlebih dulu');
            return;
        }
        if (!transferForm.bankId || !transferForm.amount) return;

        setSubmitting(true);
        try {
            const amount = Number(transferForm.amount);
            const sourceId = transferForm.type === 'DEPOSIT' ? transferForm.bankId : selectedRdn.id;
            const destId = transferForm.type === 'DEPOSIT' ? selectedRdn.id : transferForm.bankId;

            await createTransaction({
                type: 'TRANSFER',
                amount,
                sourceAccountId: sourceId,
                destinationAccountId: destId,
                ownerId: transferForm.ownerId || owners[0]?.id,
                activityId: activities[0]?.id,
                description: `${transferForm.type === 'DEPOSIT' ? 'Transfer ke investasi' : 'Pencairan investasi dari'} ${selectedRdn.name}`
            });

            setIsTransferModalOpen(false);
            setTransferForm((prev) => ({ ...prev, amount: '' }));
            await loadData();
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal memproses transfer'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateInvestmentIncome = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
            alert(incomeForm.kind === 'STOCK_GROWTH'
                ? 'Nominal perubahan investasi harus lebih dari 0'
                : 'Nominal pemasukan investasi harus lebih dari 0');
            return;
        }

        if (!incomeForm.accountId) {
            alert('Pilih rekening investasi tujuan terlebih dulu');
            return;
        }

        const destinationAccount = investmentIncomeAccounts.find((account) => account.id === incomeForm.accountId);
        if (!destinationAccount) {
            alert('Rekening investasi tujuan tidak ditemukan');
            return;
        }

        setSubmitting(true);
        try {
            const baseAmount = Number(incomeForm.amount);
            const signedAmount = incomeForm.kind === 'STOCK_GROWTH' && stockGrowthDirection === 'DOWN'
                ? -baseAmount
                : baseAmount;
            const fallbackDescription = incomeForm.kind === 'SUKUK'
                ? 'Pendapatan sukuk triwulan'
                : stockGrowthDirection === 'DOWN'
                    ? 'Penurunan saham'
                    : 'Pertumbuhan saham';

            const payload = {
                kind: incomeForm.kind as 'SUKUK' | 'STOCK_GROWTH',
                amount: signedAmount,
                ownerId: incomeForm.ownerId || owners[0]?.id,
                destinationAccountId: incomeForm.accountId,
                description: incomeForm.description.trim() || fallbackDescription,
                date: incomeForm.date
            };

            if (editingIncomeId) {
                await updateInvestmentIncome(editingIncomeId, payload);
            } else {
                await createInvestmentIncome(payload);
            }

            setIsIncomeModalOpen(false);
            setIncomeFormLock({ ownerId: '', accountId: '', active: false });
            setEditingIncomeId(null);
            setStockGrowthDirection('UP');
            setIncomeForm((prev) => ({
                ...prev,
                amount: '',
                description: prev.kind === 'SUKUK' ? 'Pendapatan sukuk triwulan' : 'Pertumbuhan saham'
            }));
            await loadData();
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal mencatat pemasukan investasi'));
        } finally {
            setSubmitting(false);
        }
    };

    const resetIncomeModalState = () => {
        setIsIncomeModalOpen(false);
        setIncomeFormLock({ ownerId: '', accountId: '', active: false });
        setEditingIncomeId(null);
        setStockGrowthDirection('UP');
    };

    const handleEditInvestmentIncome = (tx: any) => {
        const isStockGrowth = tx.activity?.name === 'Pertumbuhan Saham';
        const amount = Math.abs(Number(tx.amount || 0));

        setEditingIncomeId(tx.id);
        setIncomeFormLock({
            ownerId: tx.ownerId || '',
            accountId: tx.destinationAccountId || '',
            active: false
        });
        setStockGrowthDirection(isStockGrowth && Number(tx.amount) < 0 ? 'DOWN' : 'UP');
        setIncomeForm({
            kind: isStockGrowth ? 'STOCK_GROWTH' : 'SUKUK',
            ownerId: tx.ownerId || owners[0]?.id || '',
            accountId: tx.destinationAccountId || '',
            amount: amount > 0 ? String(amount) : '',
            description: tx.description || (isStockGrowth ? 'Pertumbuhan saham' : 'Pendapatan sukuk triwulan'),
            date: String(tx.date).slice(0, 10)
        });
        setIsIncomeModalOpen(true);
    };

    const handleDeleteInvestmentIncome = async (tx: any) => {
        const label = tx.description || tx.activity?.name || 'transaksi investasi';
        const confirmed = window.confirm(`Hapus ${label}? Nilai portofolio akan disesuaikan kembali.`);
        if (!confirmed) return;

        setSubmitting(true);
        try {
            await deleteTransaction(tx.id);
            await loadData();
        } catch (error: any) {
            alert(getErrorMessage(error, 'Gagal menghapus transaksi investasi'));
        } finally {
            setSubmitting(false);
        }
    };

    const preferredRdnForQuickAction = selectedRdnId !== 'ALL'
        ? filteredRdns.find((account) => account.id === selectedRdnId) || null
        : filteredRdns[0] || null;

    const openTransferQuickAction = () => {
        if (!preferredRdnForQuickAction) {
            alert('Belum ada rekening RDN untuk transfer investasi.');
            return;
        }

        const preferredOwnerId = selectedOwnerId !== 'ALL'
            ? selectedOwnerId
            : preferredRdnForQuickAction.ownerId || owners[0]?.id || '';

        setSelectedRdn(preferredRdnForQuickAction);
        setTransferForm((prev) => ({
            ...prev,
            type: 'DEPOSIT',
            bankId: bankAccounts[0]?.id || '',
            ownerId: preferredOwnerId,
            amount: ''
        }));
        setIsTransferModalOpen(true);
        setFabOpen(false);
    };

    const openInvestmentIncomeQuickAction = (kind: 'SUKUK' | 'STOCK_GROWTH') => {
        const preferredAccount = preferredRdnForQuickAction || investmentIncomeAccounts[0] || null;
        if (!preferredAccount) {
            alert('Belum ada rekening investasi bertipe RDN atau Sekuritas.');
            return;
        }

        const preferredOwnerId = selectedOwnerId !== 'ALL'
            ? selectedOwnerId
            : preferredAccount.ownerId || owners[0]?.id || '';

        setIncomeFormLock({ ownerId: preferredOwnerId, accountId: preferredAccount.id, active: false });
        setEditingIncomeId(null);
        setStockGrowthDirection('UP');
        setIncomeForm({
            kind,
            ownerId: preferredOwnerId,
            accountId: preferredAccount.id,
            amount: '',
            description: kind === 'SUKUK' ? 'Pendapatan sukuk triwulan' : 'Pertumbuhan saham',
            date: new Date().toISOString().slice(0, 10)
        });
        setIsIncomeModalOpen(true);
        setFabOpen(false);
    };

    const openStocksQuickAction = (side: 'BUY' | 'SELL') => {
        const query = new URLSearchParams();
        query.set('action', side === 'BUY' ? 'buy' : 'sell');
        if (preferredRdnForQuickAction?.id) query.set('accountId', preferredRdnForQuickAction.id);
        if (selectedOwnerId !== 'ALL') query.set('ownerId', selectedOwnerId);
        navigate(`/stocks?${query.toString()}`);
        setFabOpen(false);
    };

    const investmentFabActions = [
        {
            label: 'Update Nilai',
            icon: <TrendingUp size={18} />,
            gradient: 'from-emerald-500 to-green-400',
            shadow: 'rgba(16,185,129,0.4)',
            onClick: () => openInvestmentIncomeQuickAction('STOCK_GROWTH')
        },
        {
            label: 'Pemasukan',
            icon: <Wallet size={18} />,
            gradient: 'from-blue-500 to-cyan-400',
            shadow: 'rgba(59,130,246,0.4)',
            onClick: () => openInvestmentIncomeQuickAction('SUKUK')
        },
        {
            label: 'Transfer',
            icon: <ArrowRightLeft size={18} />,
            gradient: 'from-sky-500 to-blue-400',
            shadow: 'rgba(14,165,233,0.4)',
            onClick: openTransferQuickAction
        },
        {
            label: 'Order IPO',
            icon: <BarChart2 size={18} />,
            gradient: 'from-violet-500 to-purple-400',
            shadow: 'rgba(139,92,246,0.4)',
            onClick: () => {
                navigate('/stocks/ipo?newOrder=true');
                setFabOpen(false);
            }
        },
        {
            label: 'Jual Saham',
            icon: <TrendingDown size={18} />,
            gradient: 'from-rose-500 to-red-400',
            shadow: 'rgba(244,63,94,0.4)',
            onClick: () => openStocksQuickAction('SELL')
        },
        {
            label: 'Beli Saham',
            icon: <Plus size={20} strokeWidth={2.5} />,
            gradient: 'from-teal-500 to-emerald-400',
            shadow: 'rgba(20,184,166,0.4)',
            onClick: () => openStocksQuickAction('BUY')
        }
    ];

    const [exportingStocks, setExportingStocks] = useState(false);

    const exportStocksExcel = async () => {
        setExportingStocks(true);
        try {
            const XLSX = await import('xlsx');
            const ownerFilter = selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined;
            const [positions, stockTxs, ipoOrderList] = await Promise.all([
                fetchStockPositions({ ownerId: ownerFilter }),
                fetchStockTransactions({ ownerId: ownerFilter }),
                fetchIpoOrders({ ownerId: ownerFilter })
            ]);

            const positionRows = positions.map((p) => ({
                Ticker: p.ticker,
                'Total Lot': p.totalLots,
                'Harga Avg Beli (Rp)': p.avgBuyPrice,
                'Biaya Avg/Lembar (Rp)': p.avgCostPerShare,
                'Total Modal (Rp)': p.totalCost,
                'Realized PnL (Rp)': p.realizedPnl,
                'Jumlah Beli': p.buyCount,
                'Jumlah Jual': p.sellCount,
                'Terakhir Diperdagangkan': new Date(p.lastTradedAt).toLocaleDateString('id-ID'),
                Rekening: p.accountName || '-'
            }));

            const txRows = stockTxs.map((tx, i) => ({
                No: i + 1,
                Tanggal: new Date(tx.tradedAt).toLocaleDateString('id-ID'),
                Ticker: tx.ticker,
                Aksi: tx.side,
                Lot: tx.lot,
                'Harga/Lembar (Rp)': tx.pricePerShare,
                'Nilai Bruto (Rp)': tx.grossValue,
                'Fee Broker (Rp)': tx.brokerFee,
                'Fee Levy (Rp)': tx.levyFee,
                'Nilai Netto (Rp)': tx.netValue,
                Rekening: tx.account?.name || '-',
                Catatan: tx.notes || '-'
            }));

            const ipoRows = ipoOrderList.map((o, i) => ({
                No: i + 1,
                'Tanggal Pesan': new Date(o.orderedAt).toLocaleDateString('id-ID'),
                Ticker: o.ticker,
                Broker: o.broker,
                Status: o.status.replace('_', ' '),
                'Harga IPO (Rp)': o.ipoPrice,
                'Lot Pesan': o.lotRequested,
                'Lot Jatah': o.lotAllocated || 0,
                'Harga Jual (Rp)': o.sellPrice || '-',
                'Tgl Jatah': o.allottedAt ? new Date(o.allottedAt).toLocaleDateString('id-ID') : '-',
                'Tgl Jual': o.soldAt ? new Date(o.soldAt).toLocaleDateString('id-ID') : '-',
                Rekening: o.account?.name || '-',
                Catatan: o.notes || '-'
            }));

            const workbook = XLSX.utils.book_new();
            if (positionRows.length > 0) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(positionRows), 'Posisi Saham');
            if (txRows.length > 0) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(txRows), 'Transaksi Saham');
            if (ipoRows.length > 0) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ipoRows), 'Order IPO');

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
            const blob = new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            downloadBackupBlob(blob, `Portofolio Saham ${dateStr}.xlsx`);
        } catch (error: any) {
            alert('Gagal mengekspor data saham: ' + (error?.message || 'Terjadi kesalahan'));
        } finally {
            setExportingStocks(false);
        }
    };

    if (loading) return <Spinner message="Memuat Portofolio..." />;

    return (
        <div className="p-4 md:p-8 space-y-5 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="flex flex-col gap-4">
                <div className="flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-3">
                        <h1 className="text-[28px] font-black italic tracking-tight text-slate-900">Portofolio Investasi</h1>
                        <button
                            onClick={exportStocksExcel}
                            disabled={exportingStocks}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-transform active:scale-95 hover:shadow hover:-translate-y-0.5 disabled:opacity-50 shrink-0"
                            title="Export Saham & IPO ke Excel"
                        >
                            {exportingStocks ? <span className="text-xs font-bold">...</span> : <Download size={16} />}
                        </button>
                    </div>
                    <p className="text-[13px] font-medium text-slate-500 mt-1">
                        Menampilkan portofolio untuk {selectedOwnerName.toLowerCase()}.
                    </p>
                </div>

                <div className={`grid gap-3 ${portfolioData.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div className="w-full min-w-0">
                        <select
                            className="w-full bg-slate-50/70 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 border border-slate-100 hover:border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer shadow-sm truncate"
                            value={selectedOwnerId}
                            onChange={(e) => { setSelectedOwnerId(e.target.value); setSelectedRdnId('ALL'); }}
                        >
                            <option value="ALL">Semua</option>
                            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>

                    {portfolioData.length > 1 && (
                        <div className="w-full min-w-0">
                            <select
                                className="w-full bg-slate-50/70 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 border border-slate-100 hover:border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer shadow-sm truncate"
                                value={selectedRdnId}
                                onChange={(e) => setSelectedRdnId(e.target.value)}
                            >
                                <option value="ALL">Semua Sekuritas</option>
                                {portfolioData.map((rdn) => (
                                    <option key={rdn.id} value={rdn.id}>{rdn.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </header>

            {investmentIncomeAccounts.length === 0 && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-sm font-bold text-slate-900">Investasi belum bisa dicatat</p>
                        <p className="text-[11px] text-slate-600 mt-1">
                            Tambahkan dulu rekening bertipe `RDN` atau `Sekuritas`. Rekening bank seperti BCA tidak masuk sebagai rekening investasi tujuan.
                        </p>
                    </div>
                    <Link
                        to="/menu?accounts=1"
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white"
                    >
                        Setup Rekening
                    </Link>
                </div>
            )}

            {/* Summary Card */}
            <div className="app-hero-card rounded-[28px] p-5 mb-6 relative overflow-hidden shadow-sm">
                <div className="pointer-events-none absolute top-0 right-0 h-40 w-40 rounded-full blur-3xl -mr-16 -mt-16" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.18 }}></div>
                <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full blur-3xl -ml-16 -mb-16" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.12 }}></div>
                <div className="relative z-10 flex flex-col h-full">

                    <div className="mb-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 mb-1.5">Nilai Portofolio</p>
                        <p className="text-3xl font-black text-white tracking-tight">{formatCurrency(totalValue)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50 mb-1">Total Modal</p>
                            <p className="text-sm font-bold text-white leading-none">{formatCurrency(totalModal)}</p>
                            <p className="mt-1.5 text-[9px] text-white/40">{totalDepositCount} setoran masuk</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50 mb-1">Total Return</p>
                            <div className="flex items-baseline gap-1.5 leading-none">
                                <p className={`text-sm font-bold ${totalReturnAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {totalReturnAmount >= 0 ? '+' : ''}{formatCurrency(totalReturnAmount)}
                                </p>
                            </div>
                            <p className={`mt-1.5 text-[9px] font-semibold ${totalReturnAmount >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                {totalReturnAmount >= 0 ? 'Naik' : 'Turun'} {totalReturnPercent.toFixed(2)}% dari modal
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mt-auto">
                        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                                Arus Bulan Ini ({currentMonthStart.toLocaleDateString('id-ID', { month: 'short' })})
                            </p>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/70">
                                {monthlyInvestmentSnapshot.depositCount + monthlyInvestmentSnapshot.incomeCount + monthlyInvestmentSnapshot.withdrawalCount} trx
                            </span>
                        </div>

                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1">Setoran</p>
                                <p className="text-xs font-bold text-blue-300">{formatCurrency(monthlyInvestmentSnapshot.deposit)}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1">Hasil / Return</p>
                                <p className="text-xs font-bold text-emerald-300">{formatCurrency(monthlyInvestmentSnapshot.income)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1">Pencairan</p>
                                <p className="text-xs font-bold text-amber-300">{formatCurrency(monthlyInvestmentSnapshot.withdrawal)}</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <div className="flex gap-3 mb-6">
                <Link
                    to="/stocks"
                    className="flex flex-1 items-center justify-center rounded-[20px] bg-blue-600 p-4 transition-transform hover:-translate-y-0.5 shadow-sm"
                >
                    <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Portofolio</p>
                        <p className="text-base font-black text-white leading-tight mt-0.5">Saham</p>
                    </div>
                </Link>
                <Link
                    to="/stocks/ipo"
                    className="flex flex-1 items-center justify-center rounded-[20px] bg-emerald-600 p-4 transition-transform hover:-translate-y-0.5 shadow-sm"
                >
                    <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Pesanan</p>
                        <p className="text-base font-black text-white leading-tight mt-0.5">IPO</p>
                    </div>
                </Link>
            </div>

            {/* RDN List */}
            <section className="space-y-4">
                <div className="app-section-header rounded-2xl px-4 py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] sm:tracking-widest text-slate-600">
                    <h3>Ekosistem Sekuritas (RDN)</h3>
                </div>

                <div className="space-y-4">
                    {portfolioData.length === 0 && (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                            Belum ada rekening investasi. Tambahkan tipe rekening `RDN` atau `Sekuritas`.
                        </div>
                    )}

                    {portfolioData.map((rdn) => (
                        <div key={rdn.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-base text-slate-900 truncate leading-tight">{rdn.name}</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {rdn.depositCount}x setor - {rdn.incomeCount}x hasil - {rdn.stockPositionCount} saham aktif
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-base font-black text-blue-600 leading-tight">{formatCurrency(rdn.balance)}</p>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mt-0.5">Kas + Saham</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Saldo RDN</p>
                                    <p className="text-xs font-bold text-slate-800 truncate">{formatCurrency(rdn.cashBalance)}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">tunai di akun</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Nilai Saham</p>
                                    <p className="text-xs font-bold text-slate-800 truncate">{formatCurrency(rdn.stockHoldingValue)}</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">@ harga beli</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">IPO Dipesan</p>
                                    <p className={`text-xs font-bold truncate ${rdn.pendingIpoValue > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {rdn.pendingIpoValue > 0 ? formatCurrency(rdn.pendingIpoValue) : 'â€”'}
                                    </p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">belum jatah</p>
                                </div>
                            </div>

                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Dana Disetor Bersih</p>
                                    <p className="text-xs font-semibold text-slate-700">{formatCurrency(rdn.modal)}</p>
                                    {rdn.pendingIpoValue > 0 && (
                                        <p className="text-[9px] text-amber-600 mt-0.5">
                                            Tunai bebas: {formatCurrency(rdn.availableCash)}
                                        </p>
                                    )}
                                </div>
                                <div className={`shrink-0 flex items-center gap-1 text-[11px] font-bold ${rdn.returnAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {rdn.returnAmount >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    <div className="text-right">
                                        <p>{rdn.returnAmount >= 0 ? '+' : ''}{formatCurrency(rdn.returnAmount)}</p>
                                        <p className="text-[9px] opacity-80">({rdn.returnPercent.toFixed(1)}%)</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => {
                                        const preferredOwnerId = selectedOwnerId !== 'ALL'
                                            ? selectedOwnerId
                                            : owners[0]?.id || '';
                                        setSelectedRdn(rdn);
                                        setTransferForm((prev) => ({
                                            ...prev,
                                            bankId: bankAccounts[0]?.id || '',
                                            ownerId: preferredOwnerId,
                                            amount: ''
                                        }));
                                        setIsTransferModalOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-1.5 h-9 w-full rounded-xl bg-slate-100 text-slate-600 font-bold text-[10px] uppercase hover:bg-slate-200 transition-colors"
                                >
                                    <ArrowRightLeft size={12} /> Transfer
                                </button>
                                <button
                                    onClick={() => setHistoryAccount(rdn)}
                                    className="flex items-center justify-center gap-1.5 h-9 w-full rounded-xl bg-slate-50 text-slate-600 font-bold text-[10px] uppercase hover:bg-slate-100 transition-colors border border-slate-200"
                                >
                                    <History size={12} /> Riwayat
                                </button>
                                <button
                                    onClick={() => setDetailAccount(rdn)}
                                    className="col-span-2 flex items-center justify-center h-9 w-full rounded-xl bg-blue-50 text-blue-600 font-bold text-[10px] uppercase hover:bg-blue-100 transition-colors"
                                >
                                    Detail Kepemilikan
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {detailAccount && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={() => setDetailAccount(null)}>
                    <div className="w-full max-w-md bg-white rounded-[28px] border border-slate-100 p-6 space-y-5 shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Detail Kepemilikan</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Rincian nilai portofolio berdasarkan pemilik.</p>
                            </div>
                            <button onClick={() => setDetailAccount(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={15} /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl bg-blue-50/50 border border-blue-100/50 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500/80 mb-1">Rekening</p>
                                <p className="text-xl font-black text-blue-950 tracking-tight">{detailAccount.name}</p>
                                {detailAccountSummary && (
                                    <div className="mt-2 space-y-1 text-[11px] font-medium text-blue-900/70 leading-relaxed">
                                        <p>Modal {formatCurrency(detailAccountSummary.modal)} dari {detailAccountSummary.depositCount} transfer, hasil {detailAccountSummary.incomeCount} transaksi.</p>
                                        <p>Kas tersisa {formatCurrency(detailAccountSummary.cashBalance)}, saham aktif {formatCurrency(detailAccountSummary.stockHoldingValue)}, IPO pending {formatCurrency(detailAccountSummary.pendingIpoValue)}.</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="grid grid-cols-[1fr_auto] gap-3 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>Kepemilikan</span>
                                    <span>Nilai Tercatat</span>
                                </div>
                                <div className="space-y-2">
                                    {ownershipRows.length > 0 ? ownershipRows.map((row) => (
                                        <div key={row.ownerId} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
                                            <div>
                                                <span className="font-bold text-slate-900">{row.name}</span>
                                                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                                    {row.depositCount} setor, {row.incomeCount} hasil
                                                </p>
                                            </div>
                                            <span className="text-base font-black text-slate-900 tracking-tight">{formatCurrency(row.amount)}</span>
                                        </div>
                                    )) : (
                                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 text-center text-sm font-medium text-slate-500">
                                            Belum ada rincian kepemilikan.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {historyAccount && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={() => setHistoryAccount(null)}>
                    <div className="w-full max-w-md bg-white rounded-[28px] border border-slate-100 p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Riwayat Transaksi</h3>
                                <p className="mt-0.5 text-xs text-slate-500">{historyAccount.name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const preferredOwnerId = historyAccount.ownerId || (selectedOwnerId !== 'ALL' ? selectedOwnerId : owners[0]?.id || '');
                                        if (!preferredOwnerId) {
                                            alert('Rekening investasi ini belum punya kepemilikan. Atur owner rekening dulu.');
                                            return;
                                        }
                                        setIncomeFormLock({ ownerId: preferredOwnerId, accountId: historyAccount.id, active: true });
                                        setIncomeForm((prev) => ({ ...prev, kind: 'STOCK_GROWTH', ownerId: preferredOwnerId, accountId: historyAccount.id, amount: '', description: 'Pertumbuhan saham', date: new Date().toISOString().slice(0, 10) }));
                                        setEditingIncomeId(null);
                                        setIsIncomeModalOpen(true);
                                    }}
                                    className="flex h-8 items-center justify-center rounded-full bg-emerald-50 px-3 text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-colors"
                                >
                                    <TrendingUp size={12} className="mr-1.5" /> Update
                                </button>
                                <button onClick={() => setHistoryAccount(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={15} /></button>
                            </div>
                        </div>

                        <div className="overflow-y-auto overscroll-contain flex-1 -mx-2 px-2">
                            <div className="space-y-2">
                                {historyAccountTransactions.length > 0 ? (
                                    historyAccountTransactions.map((tx: any) => {
                                        const txIsIncome = isInvestmentIncome(tx);
                                        return (
                                            <div key={tx.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 hover:bg-slate-50 transition-colors">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getInvestmentFlowTone(tx, historyAccount.id)}`}>
                                                                {txIsIncome && tx.amount < 0 ? 'Penurunan' : getInvestmentFlowLabel(tx, historyAccount.id)}
                                                            </span>
                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                                {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-900 truncate">
                                                            {tx.description || tx.activity?.name || 'Transaksi investasi'}
                                                        </p>
                                                        <p className="mt-0.5 text-[11px] font-medium text-slate-500 truncate">
                                                            {tx.owner?.name || 'Tanpa owner'}
                                                            {!txIsIncome && (tx.sourceAccount?.name || tx.destinationAccount?.name) ? ` - ${tx.sourceAccount?.name || '-'} -> ${tx.destinationAccount?.name || '-'}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                                        <span className={`text-sm font-black tracking-tight ${(txIsIncome && Number(tx.amount) < 0) ? 'text-rose-600' : 'text-slate-900'}`}>
                                                            {txIsIncome && Number(tx.amount) > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                                        </span>
                                                        {txIsIncome && (
                                                            <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 shadow-sm border border-slate-100 mt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEditInvestmentIncome(tx)}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                                                                >
                                                                    <Pencil size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteInvestmentIncome(tx)}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 transition-colors"
                                                                    disabled={submitting}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 text-center text-sm font-medium text-slate-500">
                                        Belum ada riwayat transaksi.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isIncomeModalOpen && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={resetIncomeModalState}>
                    <div className="w-full max-w-md bg-white rounded-[28px] shadow-2xl border border-slate-100 p-6 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                    {editingIncomeId
                                        ? (incomeForm.kind === 'STOCK_GROWTH' ? 'Edit Pertumbuhan' : 'Edit Pemasukan')
                                        : (incomeForm.kind === 'STOCK_GROWTH' ? 'Update Nilai Investasi' : 'Pemasukan Investasi')}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {incomeForm.kind === 'STOCK_GROWTH'
                                        ? 'Catat perubahan nilai portofolio investasi.'
                                        : 'Catat pemasukan riil ke saldo investasi.'}
                                </p>
                            </div>
                            <button onClick={resetIncomeModalState} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={15} /></button>
                        </div>

                        <div className="flex gap-2 h-11 mb-4">
                            <button
                                type="button"
                                onClick={() => { setStockGrowthDirection('UP'); setIncomeForm((prev) => ({ ...prev, kind: 'SUKUK', description: 'Pendapatan sukuk triwulan' })); }}
                                className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${incomeForm.kind === 'SUKUK' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-emerald-200 hover:text-emerald-600'}`}
                            >
                                Pendapatan Sukuk
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIncomeForm((prev) => ({ ...prev, kind: 'STOCK_GROWTH', description: 'Pertumbuhan saham' })); }}
                                className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${incomeForm.kind === 'STOCK_GROWTH' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'}`}
                            >
                                Pertumbuhan Saham
                            </button>
                        </div>

                        {incomeForm.kind === 'STOCK_GROWTH' && (
                            <div className="flex gap-2 h-11 mb-4">
                                <button
                                    type="button"
                                    onClick={() => { setStockGrowthDirection('UP'); setIncomeForm((prev) => ({ ...prev, description: prev.description === 'Penurunan saham' ? 'Pertumbuhan saham' : prev.description })); }}
                                    className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${stockGrowthDirection === 'UP' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-400 border-slate-200 hover:border-emerald-200 hover:text-emerald-500'}`}
                                >
                                    Nilai Naik
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setStockGrowthDirection('DOWN'); setIncomeForm((prev) => ({ ...prev, description: prev.description === 'Pertumbuhan saham' ? 'Penurunan saham' : prev.description })); }}
                                    className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${stockGrowthDirection === 'DOWN' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-400 border-slate-200 hover:border-rose-200 hover:text-rose-500'}`}
                                >
                                    Nilai Turun
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleCreateInvestmentIncome} className="space-y-4">
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Kepemilikan</span>
                                <select
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={incomeForm.ownerId}
                                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                                    disabled={incomeFormLock.active}
                                >
                                    {owners.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                                    ))}
                                </select>
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Nominal</span>
                                    <input
                                        required
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-semibold bg-slate-50"
                                        value={activeAmountField === 'income' ? incomeForm.amount : formatThousands(incomeForm.amount)}
                                        onChange={(e) => setIncomeForm((prev) => ({ ...prev, amount: sanitizeAmount(e.target.value) }))}
                                        onFocus={() => setActiveAmountField('income')}
                                        onBlur={() => setActiveAmountField((current) => current === 'income' ? null : current)}
                                    />
                                </label>
                                <label className="space-y-1.5 block">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Tanggal</span>
                                    <input
                                        required
                                        type="date"
                                        className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-medium bg-slate-50"
                                        value={incomeForm.date}
                                        onChange={(e) => setIncomeForm((prev) => ({ ...prev, date: e.target.value }))}
                                    />
                                </label>
                            </div>

                            {incomeForm.kind === 'STOCK_GROWTH' && (
                                <p className={`text-[11px] font-semibold ${stockGrowthDirection === 'DOWN' ? 'text-rose-600' : 'text-emerald-600'} ml-1 -mt-2`}>
                                    {stockGrowthDirection === 'DOWN'
                                        ? 'Akan dicatat sebagai penurunan nilai portofolio.'
                                        : 'Akan dicatat sebagai kenaikan nilai portofolio.'}
                                </p>
                            )}

                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Rekening Investasi Tujuan</span>
                                <select
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={incomeForm.accountId}
                                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, accountId: e.target.value }))}
                                    required
                                    disabled={investmentIncomeAccounts.length === 0 || incomeFormLock.active}
                                >
                                    <option value="" disabled>Pilih rekening investasi...</option>
                                    {investmentIncomeAccounts.map((account) => (
                                        <option key={account.id} value={account.id}>{account.name} ({account.type})</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Keterangan</span>
                                <input
                                    type="text"
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={incomeForm.description}
                                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, description: e.target.value }))}
                                />
                            </label>

                            <button
                                disabled={submitting || investmentIncomeAccounts.length === 0}
                                className="w-full h-12 rounded-2xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-60 flex items-center justify-center gap-2 mt-4 shadow-lg shadow-blue-600/20 hover:bg-blue-500 active:scale-95 transition-all"
                            >
                                <Save size={16} /> {submitting ? 'Menyimpan...' : editingIncomeId ? 'Simpan Perubahan' : 'Catat Pemasukan'}
                            </button>

                            {investmentIncomeAccounts.length === 0 ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <p className="text-[11px] text-slate-700">
                                        Belum ada rekening investasi bertipe `RDN` atau `Sekuritas`, jadi transaksi investasi belum bisa dibuat.
                                    </p>
                                    <Link
                                        to="/menu?accounts=1"
                                        className="inline-flex mt-3 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white"
                                    >
                                        Tambah Rekening Investasi
                                    </Link>
                                </div>
                            ) : null}
                        </form>
                    </div>
                </div>
            )}

            {/* Transfer Modal */}
            {isTransferModalOpen && selectedRdn && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={() => setIsTransferModalOpen(false)}>
                    <div className="w-full max-w-md bg-white rounded-[28px] shadow-2xl border border-slate-100 p-6 animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Transfer Dana Investasi</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Pindah dana antara bank dan rekening investasi.</p>
                            </div>
                            <button onClick={() => setIsTransferModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors shrink-0"><X size={15} /></button>
                        </div>

                        <div className="flex gap-2 h-11 mb-4">
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'DEPOSIT' })}
                                className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${transferForm.type === 'DEPOSIT' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'}`}
                            >
                                Ke Investasi
                            </button>
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'WITHDRAW' })}
                                className={`flex-1 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all border ${transferForm.type === 'WITHDRAW' ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-amber-200 hover:text-amber-500'}`}
                            >
                                Pencairan
                            </button>
                        </div>

                        <form onSubmit={handleTransfer} className="space-y-4">
                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Kepemilikan</span>
                                <select
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={transferForm.ownerId}
                                    onChange={e => setTransferForm({ ...transferForm, ownerId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Pilih kepemilikan...</option>
                                    {owners.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">
                                    {transferForm.type === 'DEPOSIT' ? 'Rekening Sumber Dana' : 'Rekening Tujuan Pencairan'}
                                </span>
                                <select
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm bg-slate-50 font-medium"
                                    value={transferForm.bankId}
                                    onChange={e => setTransferForm({ ...transferForm, bankId: e.target.value })}
                                    required
                                    disabled={bankAccounts.length === 0}
                                >
                                    <option value="" disabled>
                                        {transferForm.type === 'DEPOSIT' ? 'Pilih rekening sumber...' : 'Pilih rekening tujuan...'}
                                    </option>
                                    {bankAccounts.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} ({formatCurrency(b.balance)})</option>
                                    ))}
                                </select>
                                {bankAccounts.length === 0 && (
                                    <p className="mt-1 text-[11px] text-amber-600 ml-1">
                                        Belum ada rekening bank atau e-wallet yang tersedia.
                                    </p>
                                )}
                            </label>

                            <label className="space-y-1.5 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Nominal Transfer</span>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="w-full rounded-2xl border border-slate-200 px-4 h-11 text-sm font-semibold bg-slate-50"
                                    value={activeAmountField === 'transfer' ? transferForm.amount : formatThousands(transferForm.amount)}
                                    onChange={(e) => setTransferForm((f) => ({ ...f, amount: sanitizeAmount(e.target.value) }))}
                                    onFocus={() => setActiveAmountField('transfer')}
                                    onBlur={() => setActiveAmountField((current) => current === 'transfer' ? null : current)}
                                />
                            </label>

                            <button disabled={submitting} className={`w-full h-12 rounded-2xl text-white text-xs font-bold uppercase tracking-widest disabled:opacity-60 flex items-center justify-center gap-2 mt-4 shadow-lg active:scale-95 transition-all ${transferForm.type === 'DEPOSIT' ? 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-500' : 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-400'}`}>
                                <ArrowRightLeft size={16} /> {submitting ? 'Memproses...' : transferForm.type === 'DEPOSIT' ? 'Transfer ke Investasi' : 'Pencairan ke Bank'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <div
                className={`fixed inset-0 z-[45] transition-all duration-300 ${fabOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}
                onClick={() => setFabOpen(false)}
            />

            <div className="fixed bottom-[104px] sm:bottom-[112px] right-5 sm:right-8 z-50 flex flex-col-reverse gap-3 items-end">
                {investmentFabActions.map((action, idx) => (
                    <div
                        key={action.label}
                        className="flex items-center gap-3 transition-all duration-300"
                        style={{
                            transitionDelay: fabOpen ? `${idx * 40}ms` : `${(investmentFabActions.length - 1 - idx) * 30}ms`,
                            opacity: fabOpen ? 1 : 0,
                            transform: fabOpen ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.85)',
                            pointerEvents: fabOpen ? 'auto' : 'none',
                        }}
                    >
                        <span className="whitespace-nowrap rounded-2xl border border-white/60 bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur-sm">
                            {action.label}
                        </span>
                        <button
                            onClick={action.onClick}
                            className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${action.gradient} text-white transition-transform active:scale-90`}
                            style={{ boxShadow: `0 6px 20px -4px ${action.shadow}` }}
                        >
                            {action.icon}
                        </button>
                    </div>
                ))}
            </div>

            <button
                onClick={() => setFabOpen((prev) => !prev)}
                className="fixed bottom-[104px] sm:bottom-[112px] right-5 sm:right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.5)] transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-95"
                style={{ transform: `rotate(${fabOpen ? '45deg' : '0deg'})` }}
                title="Aksi Investasi"
            >
                <Plus size={28} strokeWidth={3} className={`transition-transform duration-300 ${fabOpen ? 'rotate-45' : 'rotate-0'}`} />
            </button>
        </div>
    );
};

export default Investment;

