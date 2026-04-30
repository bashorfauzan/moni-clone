import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ArrowRightLeft, X, Save } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { createInvestmentIncome, createTransaction, fetchTransactions } from '../services/transactions';
import { Link } from 'react-router-dom';
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

const Investment = () => {
    const [rdnAccounts, setRdnAccounts] = useState<any[]>([]);
    const [investmentIncomeAccounts, setInvestmentIncomeAccounts] = useState<any[]>([]);
    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [owners, setOwners] = useState<any[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');

    // Modals
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [selectedRdn, setSelectedRdn] = useState<any>(null);
    const [detailAccount, setDetailAccount] = useState<any | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [incomeFormLock, setIncomeFormLock] = useState<{ ownerId: string; accountId: string; active: boolean }>({
        ownerId: '',
        accountId: '',
        active: false
    });

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

    const loadData = async () => {
        try {
            const [metaRes, txRes] = await Promise.all([
                fetchMasterMeta(),
                fetchTransactions()
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
        loadData();
    }, []);

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
        const returnAmount = summary.currentValue - summary.modal;
        const returnPercent = summary.modal > 0 ? (returnAmount / summary.modal) * 100 : 0;

        return {
            ...rdn,
            balance: summary.currentValue,
            modal: summary.modal,
            returnAmount,
            returnPercent,
            depositCount: summary.depositCount,
            withdrawalCount: summary.withdrawalCount,
            incomeCount: summary.incomeCount
        };
    }).filter((rdn) => Math.abs(Number(rdn.balance || 0)) > 0 || Math.abs(rdn.modal) > 0);

    const totalValue = portfolioData.reduce((sum, rdn) => sum + Math.abs(Number(rdn.balance || 0)), 0);
    const totalModal = portfolioData.reduce((sum, rdn) => sum + Number(rdn.modal || 0), 0);
    const totalReturnAmount = totalValue - totalModal;
    const totalReturnPercent = totalModal > 0 ? (totalReturnAmount / totalModal) * 100 : 0;
    const totalDepositCount = portfolioData.reduce((sum, rdn) => sum + Number(rdn.depositCount || 0), 0);
    const totalIncomeCount = portfolioData.reduce((sum, rdn) => sum + Number(rdn.incomeCount || 0), 0);
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
        ? summarizeFlows(scopedTransactions, detailAccount.id)
        : null;
    const detailAccountTransactions = detailAccount
        ? scopedTransactions
            .filter((tx: any) =>
                (isInvestmentTransfer(tx) && tx.destinationAccountId === detailAccount.id)
                || (normalizeTransactionType(tx.type) === 'TRANSFER' && tx.sourceAccountId === detailAccount.id)
                || (isInvestmentIncome(tx) && tx.destinationAccountId === detailAccount.id)
            )
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 6)
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
            alert(error.response?.data?.error || 'Gagal memproses transfer');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateInvestmentIncome = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
            alert('Nominal pemasukan investasi harus lebih dari 0');
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
            await createInvestmentIncome({
                kind: incomeForm.kind as 'SUKUK' | 'STOCK_GROWTH',
                amount: Number(incomeForm.amount),
                ownerId: incomeForm.ownerId || owners[0]?.id,
                destinationAccountId: incomeForm.accountId,
                description: incomeForm.description.trim() || (incomeForm.kind === 'SUKUK' ? 'Pendapatan sukuk triwulan' : 'Pertumbuhan saham'),
                date: incomeForm.date
            });

            setIsIncomeModalOpen(false);
            setIncomeFormLock({ ownerId: '', accountId: '', active: false });
            setIncomeForm((prev) => ({
                ...prev,
                amount: '',
                description: prev.kind === 'SUKUK' ? 'Pendapatan sukuk triwulan' : 'Pertumbuhan saham'
            }));
            await loadData();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Gagal mencatat pemasukan investasi');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Spinner message="Memuat Portofolio..." />;

    return (
        <div className="p-4 md:p-8 space-y-5 md:space-y-8 pb-32 mx-auto w-full max-w-6xl">
            <header className="flex flex-col gap-4">
                <div>
                    <h1 className="text-2xl font-bold italic text-slate-900">Portofolio Investasi</h1>
                    <p className="mt-2 text-xs text-slate-500">
                        Menampilkan portofolio untuk {selectedOwnerName}.
                    </p>
                </div>
                <div className="flex flex-col gap-3 w-full lg:flex-row lg:items-center lg:justify-between">

                    <div className="w-full lg:w-[240px]">
                        <select
                            className="w-full bg-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 border-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                            value={selectedOwnerId}
                            onChange={(e) => setSelectedOwnerId(e.target.value)}
                        >
                            <option value="ALL">Semua Kepemilikan (Global)</option>
                            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>
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
            <div className="app-hero-card rounded-3xl p-4 mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 h-32 w-32 rounded-full blur-3xl -mr-16 -mt-16" style={{ backgroundColor: 'var(--theme-hero-glow)', opacity: 0.18 }}></div>
                <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full blur-3xl -ml-14 -mb-14" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.12 }}></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Portofolio Saya</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Nilai Aset</p>
                            <p className="mt-1 text-xs font-bold text-sky-300 break-all leading-snug">{formatCurrency(totalValue)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Modal</p>
                            <p className="mt-1 text-xs font-bold text-white break-all leading-snug">{formatCurrency(totalModal)}</p>
                            <p className="mt-1 text-[8px] font-bold text-white/55">{totalDepositCount} transfer masuk</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Return</p>
                            <p className={`mt-1 text-xs font-bold break-all leading-snug ${totalReturnAmount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {totalReturnAmount >= 0 ? '+' : ''}{formatCurrency(totalReturnAmount)}
                            </p>
                            <p className={`text-[8px] font-bold mt-0.5 ${totalReturnAmount >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                                {totalReturnPercent.toFixed(2)}%
                            </p>
                            <p className="text-[8px] font-bold text-white/55">{totalIncomeCount} pemasukan investasi</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Snapshot Bulan Ini</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            Arus investasi untuk {selectedOwnerName} pada {currentMonthStart.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.
                        </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {monthlyInvestmentSnapshot.depositCount + monthlyInvestmentSnapshot.incomeCount + monthlyInvestmentSnapshot.withdrawalCount} transaksi
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-blue-50 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-500">Setoran Modal</p>
                        <p className="mt-2 text-base font-black text-blue-700">{formatCurrency(monthlyInvestmentSnapshot.deposit)}</p>
                        <p className="mt-1 text-[11px] text-blue-600">{monthlyInvestmentSnapshot.depositCount} transaksi</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500">Hasil Investasi</p>
                        <p className="mt-2 text-base font-black text-emerald-700">{formatCurrency(monthlyInvestmentSnapshot.income)}</p>
                        <p className="mt-1 text-[11px] text-emerald-600">{monthlyInvestmentSnapshot.incomeCount} transaksi</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Pencairan</p>
                        <p className="mt-2 text-base font-black text-amber-700">{formatCurrency(monthlyInvestmentSnapshot.withdrawal)}</p>
                        <p className="mt-1 text-[11px] text-amber-600">{monthlyInvestmentSnapshot.withdrawalCount} transaksi</p>
                    </div>
                </div>
            </div>
            {/* RDN List */}
            <section className="space-y-4">
                <div className="app-section-header rounded-2xl px-4 py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] sm:tracking-widest text-slate-600">
                    <h3>Daftar Sekuritas (RDN)</h3>
                </div>

                <div className="space-y-4">
                    {portfolioData.length === 0 && (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                            Belum ada rekening investasi. Tambahkan tipe rekening `RDN` atau `Sekuritas`.
                        </div>
                    )}

                    {portfolioData.map((rdn) => (
                        <div key={rdn.id} className="bg-white border border-slate-200 rounded-[24px] p-4 sm:p-5 space-y-4 shadow-sm">
                            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-lg text-slate-900">{rdn.name}</h3>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Nilai Tercatat</p>
                                    <p className="text-xl font-bold text-blue-600 break-words">{formatCurrency(rdn.balance)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                        Modal dari {rdn.depositCount} transfer, hasil investasi {rdn.incomeCount} transaksi
                                    </p>
                                </div>
                                <div className="min-w-0 sm:text-right">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Modal</p>
                                    <p className="text-sm font-semibold text-slate-700 break-words">{formatCurrency(rdn.modal)}</p>

                                    <div className={`mt-2 flex flex-wrap items-center sm:justify-end gap-1 text-xs font-bold break-words ${rdn.returnAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {rdn.returnAmount >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        {formatCurrency(Math.abs(rdn.returnAmount))} ({rdn.returnPercent.toFixed(2)}%)
                                    </div>
                                    {rdn.withdrawalCount > 0 && (
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            Termasuk {rdn.withdrawalCount} pencairan ke rekening lain
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-100 sm:grid-cols-2">
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
                                    className="flex items-center justify-center gap-2 h-11 w-full rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors"
                                >
                                    <ArrowRightLeft size={14} /> Transfer / Cairkan
                                </button>
                                <button
                                    onClick={() => {
                                        const preferredOwnerId = selectedOwnerId !== 'ALL'
                                            ? selectedOwnerId
                                            : owners[0]?.id || '';
                                        if (selectedOwnerId === 'ALL') {
                                            alert('Pilih kepemilikan tertentu dulu agar pertumbuhan investasi tercatat ke owner yang benar.');
                                            return;
                                        }
                                        setIncomeFormLock({
                                            ownerId: preferredOwnerId,
                                            accountId: rdn.id,
                                            active: true
                                        });
                                        setIncomeForm((prev) => ({
                                            ...prev,
                                            kind: 'STOCK_GROWTH',
                                            ownerId: preferredOwnerId,
                                            accountId: rdn.id,
                                            amount: '',
                                            description: 'Pertumbuhan saham',
                                            date: new Date().toISOString().slice(0, 10)
                                        }));
                                        setIsIncomeModalOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-2 h-11 w-full rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-colors"
                                >
                                    <TrendingUp size={14} /> Update Pertumbuhan
                                </button>
                                <button
                                    onClick={() => setDetailAccount(rdn)}
                                    className="flex items-center justify-center h-11 w-full rounded-xl bg-blue-50 text-blue-600 font-bold text-xs hover:bg-blue-100 transition-colors"
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
                    <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900">Detail Kepemilikan</h3>
                            </div>
                            <button onClick={() => setDetailAccount(null)} className="p-2 text-slate-400"><X size={18} /></button>
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Rekening</p>
                                <p className="text-lg font-bold text-slate-900">{detailAccount.name}</p>
                                {detailAccountSummary && (
                                    <p className="mt-2 text-[11px] text-slate-600">
                                        Modal {formatCurrency(detailAccountSummary.modal)} dari {detailAccountSummary.depositCount} transfer, hasil investasi {detailAccountSummary.incomeCount} transaksi.
                                    </p>
                                )}
                            </div>
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div className="bg-slate-50 px-4 py-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Transaksi</p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                        Menampilkan 6 transaksi terbaru yang membentuk angka rekening ini.
                                    </p>
                                </div>
                                {detailAccountTransactions.length > 0 ? (
                                    <div className="max-h-80 overflow-y-auto overscroll-contain">
                                        {detailAccountTransactions.map((tx: any) => (
                                            <div key={tx.id} className="flex items-start justify-between gap-3 border-t border-slate-100 px-4 py-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${getInvestmentFlowTone(tx, detailAccount.id)}`}>
                                                            {getInvestmentFlowLabel(tx, detailAccount.id)}
                                                        </span>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                            {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                                                        {tx.description || tx.activity?.name || 'Transaksi investasi'}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-slate-500">
                                                        {tx.owner?.name || 'Tanpa owner'}
                                                        {(tx.sourceAccount?.name || tx.destinationAccount?.name) ? ` • ${tx.sourceAccount?.name || '-'} -> ${tx.destinationAccount?.name || '-'}` : ''}
                                                    </p>
                                                </div>
                                                <span className="shrink-0 text-sm font-black text-slate-900">
                                                    {formatCurrency(tx.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-4 text-sm text-slate-500">
                                        Belum ada transaksi investasi yang bisa ditelusuri untuk rekening ini.
                                    </div>
                                )}
                            </div>
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div className="grid grid-cols-[1fr_auto] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    <span>Nama</span>
                                    <span>Nilai Tercatat</span>
                                </div>
                                {ownershipRows.length > 0 ? ownershipRows.map((row) => (
                                    <div key={row.ownerId} className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                                        <div>
                                            <span className="font-semibold text-slate-900">{row.name}</span>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                {row.depositCount} setoran, {row.incomeCount} hasil investasi
                                            </p>
                                        </div>
                                        <span className="font-bold text-slate-900">{formatCurrency(row.amount)}</span>
                                    </div>
                                )) : (
                                    <div className="px-4 py-4 text-sm text-slate-500">
                                        Belum ada rincian kepemilikan yang tercatat untuk rekening ini.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isIncomeModalOpen && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={() => { setIsIncomeModalOpen(false); setIncomeFormLock({ ownerId: '', accountId: '', active: false }); }}>
                    <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 p-6 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900">Pemasukan Investasi</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                    Pemasukan akan langsung menambah saldo rekening investasi yang dipilih
                                </p>
                            </div>
                            <button onClick={() => { setIsIncomeModalOpen(false); setIncomeFormLock({ ownerId: '', accountId: '', active: false }); }} className="p-2 text-slate-400"><X size={18} /></button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setIncomeForm((prev) => ({ ...prev, kind: 'SUKUK', description: 'Pendapatan sukuk triwulan' }))}
                                className={`h-11 rounded-2xl border text-xs font-bold uppercase tracking-wider ${incomeForm.kind === 'SUKUK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
                            >
                                Pendapatan Sukuk
                            </button>
                            <button
                                type="button"
                                onClick={() => setIncomeForm((prev) => ({ ...prev, kind: 'STOCK_GROWTH', description: 'Pertumbuhan saham' }))}
                                className={`h-11 rounded-2xl border text-xs font-bold uppercase tracking-wider ${incomeForm.kind === 'STOCK_GROWTH' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}
                            >
                                Pertumbuhan Saham
                            </button>
                        </div>

                        <form onSubmit={handleCreateInvestmentIncome} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Kepemilikan</label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm bg-white"
                                    value={incomeForm.ownerId}
                                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                                    disabled={incomeFormLock.active}
                                >
                                    {owners.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Nominal</label>
                                    <input
                                        required
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="0"
                                        className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm font-semibold"
                                        value={formatThousands(incomeForm.amount)}
                                        onChange={(e) => setIncomeForm((prev) => ({ ...prev, amount: sanitizeAmount(e.target.value) }))}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Tanggal</label>
                                    <input
                                        required
                                        type="date"
                                        className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm"
                                        value={incomeForm.date}
                                        onChange={(e) => setIncomeForm((prev) => ({ ...prev, date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Rekening Investasi Tujuan</label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm bg-white"
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
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Keterangan</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm"
                                    value={incomeForm.description}
                                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <button
                                disabled={submitting || investmentIncomeAccounts.length === 0}
                                className="w-full h-12 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                            >
                                <Save size={16} /> {submitting ? 'Menyimpan...' : 'Catat Pemasukan'}
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
                    <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Transfer Dana Investasi</h3>
                            <button onClick={() => setIsTransferModalOpen(false)} className="p-2 text-slate-400"><X size={18} /></button>
                        </div>

                        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'DEPOSIT' })}
                                className={`flex-1 text-xs font-bold h-9 rounded-lg transition-all ${transferForm.type === 'DEPOSIT' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                            >
                                Transfer ke Investasi
                            </button>
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'WITHDRAW' })}
                                className={`flex-1 text-xs font-bold h-9 rounded-lg transition-all ${transferForm.type === 'WITHDRAW' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
                            >
                                Pencairan ke Bank
                            </button>
                        </div>

                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Kepemilikan</label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm bg-white"
                                    value={transferForm.ownerId}
                                    onChange={e => setTransferForm({ ...transferForm, ownerId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Pilih kepemilikan...</option>
                                    {owners.map((owner) => (
                                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                                    {transferForm.type === 'DEPOSIT' ? 'Rekening Sumber Dana' : 'Rekening Tujuan Pencairan'}
                                </label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm bg-white"
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
                                    <p className="mt-1 text-[11px] text-amber-600">
                                        Belum ada rekening bank atau e-wallet yang tersedia.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Nominal Transfer</label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm font-semibold"
                                    value={formatThousands(transferForm.amount)}
                                    onChange={(e) => setTransferForm((f) => ({ ...f, amount: sanitizeAmount(e.target.value) }))}
                                />
                            </div>

                            <button disabled={submitting} className="w-full h-12 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
                                <ArrowRightLeft size={16} /> {submitting ? 'Memproses...' : transferForm.type === 'DEPOSIT' ? 'Catat Transfer ke Investasi' : 'Catat Pencairan ke Bank'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Investment;
