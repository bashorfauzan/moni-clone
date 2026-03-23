import { useState, useEffect } from 'react';
import api from '../services/api';
import { TrendingUp, TrendingDown, ArrowRightLeft, X, Save } from 'lucide-react';
import { fetchMasterMeta } from '../services/masterData';
import { fetchTransactions } from '../services/transactions';
import { Link } from 'react-router-dom';
import Spinner from '../components/Spinner';

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(val);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');
const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
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
    let totalValue = 0;
    let totalModal = 0;
    const validatedTransactions = transactions.filter((tx: any) => tx.isValidated);

    const filteredRdns = selectedOwnerId === 'ALL'
        ? rdnAccounts
        : rdnAccounts.filter(r => r.ownerId === selectedOwnerId);

    const portfolioData = filteredRdns.map(rdn => {
        // Calculate Modal for this RDN
        let modal = 0;
        validatedTransactions.forEach(tx => {
            if (tx.type === 'TRANSFER') {
                if (tx.destinationAccountId === rdn.id) {
                    modal += tx.amount;
                } else if (tx.sourceAccountId === rdn.id) {
                    modal -= tx.amount;
                }
            }
        });

        const currentValue = Math.abs(Number(rdn.balance || 0));
        const returnAmount = currentValue - modal;
        const returnPercent = modal > 0 ? (returnAmount / modal) * 100 : 0;

        totalValue += currentValue;
        totalModal += modal;

        return { ...rdn, modal, returnAmount, returnPercent };
    });

    const totalReturnAmount = totalValue - totalModal;
    const totalReturnPercent = totalModal > 0 ? (totalReturnAmount / totalModal) * 100 : 0;
    const ownershipRows = detailAccount
        ? owners
            .map((owner) => {
                let amount = 0;

                validatedTransactions.forEach((tx: any) => {
                    if (tx.ownerId !== owner.id) return;

                    if (tx.type === 'TRANSFER') {
                        if (tx.destinationAccountId === detailAccount.id) amount += tx.amount;
                        if (tx.sourceAccountId === detailAccount.id) amount -= tx.amount;
                    }

                    if (
                        tx.type === 'INCOME'
                        && tx.destinationAccountId === detailAccount.id
                        && (tx.activity?.name === 'Pendapatan Sukuk' || tx.activity?.name === 'Pertumbuhan Saham')
                    ) {
                        amount += tx.amount;
                    }
                });

                return { ownerId: owner.id, name: owner.name, amount };
            })
            .filter((row) => row.amount !== 0)
            .sort((a, b) => b.amount - a.amount)
        : [];

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transferForm.bankId || !transferForm.amount) return;

        setSubmitting(true);
        try {
            const amount = Number(transferForm.amount);
            const sourceId = transferForm.type === 'DEPOSIT' ? transferForm.bankId : selectedRdn.id;
            const destId = transferForm.type === 'DEPOSIT' ? selectedRdn.id : transferForm.bankId;

            await api.post('/transactions', {
                type: 'TRANSFER',
                amount,
                sourceAccountId: sourceId,
                destinationAccountId: destId,
                ownerId: transferForm.ownerId || owners[0]?.id,
                activityId: activities[0]?.id,
                description: `${transferForm.type === 'DEPOSIT' ? 'Deposit ke' : 'Penarikan dari'} RDN ${selectedRdn.name}`
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
            await api.post('/transactions/investment-income', {
                kind: incomeForm.kind,
                amount: Number(incomeForm.amount),
                ownerId: incomeForm.ownerId || owners[0]?.id,
                destinationAccountId: incomeForm.accountId,
                description: incomeForm.description.trim() || (incomeForm.kind === 'SUKUK' ? 'Pendapatan sukuk triwulan' : 'Pertumbuhan saham'),
                date: incomeForm.date
            });

            setIsIncomeModalOpen(false);
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
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.14em] sm:tracking-wider">Rekapitulasi Modal & Return Multi-Sekuritas</p>
                </div>
                <div className="flex flex-col gap-3 w-full lg:flex-row lg:items-center lg:justify-between">
                    <button
                        type="button"
                        onClick={() => setIsIncomeModalOpen(true)}
                        className="h-11 rounded-2xl bg-slate-900 text-white px-4 sm:px-5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] sm:tracking-widest disabled:opacity-50 w-full lg:w-auto"
                        disabled={investmentIncomeAccounts.length === 0}
                    >
                        Catat Pemasukan Investasi
                    </button>
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
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Return</p>
                            <p className={`mt-1 text-xs font-bold break-all leading-snug ${totalReturnAmount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {totalReturnAmount >= 0 ? '+' : ''}{formatCurrency(totalReturnAmount)}
                            </p>
                            <p className={`text-[8px] font-bold mt-0.5 ${totalReturnAmount >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                                {totalReturnPercent.toFixed(2)}%
                            </p>
                        </div>
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
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Nilai Saat Ini</p>
                                    <p className="text-xl font-bold text-blue-600 break-words">{formatCurrency(rdn.balance)}</p>
                                </div>
                                <div className="min-w-0 sm:text-right">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Modal</p>
                                    <p className="text-sm font-semibold text-slate-700 break-words">{formatCurrency(rdn.modal)}</p>

                                    <div className={`mt-2 flex flex-wrap items-center sm:justify-end gap-1 text-xs font-bold break-words ${rdn.returnAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {rdn.returnAmount >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        {formatCurrency(Math.abs(rdn.returnAmount))} ({rdn.returnPercent.toFixed(2)}%)
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-100 sm:grid-cols-2">
                                <button
                                    onClick={() => {
                                        setSelectedRdn(rdn);
                                        setTransferForm((prev) => ({
                                            ...prev,
                                            bankId: bankAccounts[0]?.id || '',
                                            ownerId: prev.ownerId || owners[0]?.id || ''
                                        }));
                                        setIsTransferModalOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-2 h-11 w-full rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors"
                                >
                                    <ArrowRightLeft size={14} /> Deposit / Tarik
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
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                    Informasi pemilik rekening investasi
                                </p>
                            </div>
                            <button onClick={() => setDetailAccount(null)} className="p-2 text-slate-400"><X size={18} /></button>
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Rekening</p>
                                <p className="text-lg font-bold text-slate-900">{detailAccount.name}</p>
                            </div>
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div className="grid grid-cols-[1fr_auto] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    <span>Nama</span>
                                    <span>Jumlah Dana</span>
                                </div>
                                {ownershipRows.length > 0 ? ownershipRows.map((row) => (
                                    <div key={row.ownerId} className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 px-4 py-3 text-sm">
                                        <span className="font-semibold text-slate-900">{row.name}</span>
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
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onMouseDown={() => setIsIncomeModalOpen(false)}>
                    <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 p-6 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900">Pemasukan Investasi</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                    Pemasukan akan langsung menambah saldo rekening investasi yang dipilih
                                </p>
                            </div>
                            <button onClick={() => setIsIncomeModalOpen(false)} className="p-2 text-slate-400"><X size={18} /></button>
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
                                    disabled={investmentIncomeAccounts.length === 0}
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
                            <h3 className="font-bold text-slate-900">Transfer Dana RDN</h3>
                            <button onClick={() => setIsTransferModalOpen(false)} className="p-2 text-slate-400"><X size={18} /></button>
                        </div>

                        <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'DEPOSIT' })}
                                className={`flex-1 text-xs font-bold h-9 rounded-lg transition-all ${transferForm.type === 'DEPOSIT' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                            >
                                Deposit (+Modal)
                            </button>
                            <button
                                onClick={() => setTransferForm({ ...transferForm, type: 'WITHDRAW' })}
                                className={`flex-1 text-xs font-bold h-9 rounded-lg transition-all ${transferForm.type === 'WITHDRAW' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}
                            >
                                Tarik (-Modal)
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
                                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Rekening Bank Sumber/Tujuan</label>
                                <select
                                    className="w-full rounded-xl border border-slate-200 px-4 h-11 text-sm bg-white"
                                    value={transferForm.bankId}
                                    onChange={e => setTransferForm({ ...transferForm, bankId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Pilih Rekening Bank...</option>
                                    {bankAccounts.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} ({formatCurrency(b.balance)})</option>
                                    ))}
                                </select>
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
                                <ArrowRightLeft size={16} /> {submitting ? 'Memproses...' : 'Transfer Dana'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Investment;
