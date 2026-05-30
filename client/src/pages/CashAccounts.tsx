import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, ExternalLink, Smartphone } from 'lucide-react';
import Spinner from '../components/Spinner';
import { fetchMasterMeta, type Account, type Owner } from '../services/masterData';
import { canLaunchAccountApp, launchAccountApp } from '../services/accountLauncher';
import { useTransaction } from '../context/TransactionContext';

const CASH_ACCOUNT_TYPES = ['Bank', 'E-Wallet'];

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(value || 0);

const CashAccounts = () => {
    const { openModal } = useTransaction();
    const [loading, setLoading] = useState(true);
    const [owners, setOwners] = useState<Owner[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedOwnerId, setSelectedOwnerId] = useState('ALL');
    const [onlyWithBalance, setOnlyWithBalance] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const meta = await fetchMasterMeta();
                setOwners(meta.owners);
                setAccounts(meta.accounts.filter((account) => CASH_ACCOUNT_TYPES.includes(account.type)));
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const filteredAccounts = useMemo(() => {
        const byOwner = selectedOwnerId === 'ALL'
            ? accounts
            : accounts.filter((account) => Number(account.ownerBalances?.[selectedOwnerId] ?? 0) !== 0);

        return byOwner.filter((account) => {
            if (!onlyWithBalance) return true;
            if (selectedOwnerId !== 'ALL') {
                return Math.abs(Number(account.ownerBalances?.[selectedOwnerId] ?? 0)) > 0;
            }
            return Math.abs(Number(account.balance || 0)) > 0;
        }).sort((left, right) => {
            const leftBalance = selectedOwnerId !== 'ALL'
                ? Number(left.ownerBalances?.[selectedOwnerId] ?? 0)
                : Number(left.balance || 0);
            const rightBalance = selectedOwnerId !== 'ALL'
                ? Number(right.ownerBalances?.[selectedOwnerId] ?? 0)
                : Number(right.balance || 0);

            return rightBalance - leftBalance;
        });
    }, [accounts, onlyWithBalance, selectedOwnerId]);

    const ownerNameById = Object.fromEntries(owners.map((owner) => [owner.id, owner.name]));
    const totalCash = filteredAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);

    if (loading) return <Spinner message="Memuat rekening kas..." />;

    return (
        <div className="p-4 md:p-8 pb-32 mx-auto w-full max-w-6xl space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <ArrowLeft size={14} /> Kembali ke Home
                    </Link>
                    <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Isi Rekening Kas</h1>
                    <p className="mt-1 text-sm text-slate-500">Lihat saldo Bank dan E-Wallet tanpa masuk ke modul investasi.</p>
                </div>
            </div>

            <section className="rounded-[28px] bg-slate-900 p-6 text-white shadow-2xl shadow-slate-900/15">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">Total Kas Tersedia</p>
                <p className="mt-2 text-3xl font-black tracking-tight">{formatCurrency(totalCash)}</p>
                <p className="mt-2 text-xs text-white/65">{filteredAccounts.length} rekening Bank/E-Wallet terpantau</p>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pemilik:</span>
                        <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setSelectedOwnerId('ALL')}
                                className={`rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${selectedOwnerId === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Semua
                            </button>
                            {owners.map((owner) => (
                                <button
                                    key={owner.id}
                                    type="button"
                                    onClick={() => setSelectedOwnerId(owner.id)}
                                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${selectedOwnerId === owner.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {owner.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-600">
                        <input
                            type="checkbox"
                            checked={onlyWithBalance}
                            onChange={(event) => setOnlyWithBalance(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Hanya Ada Dana
                    </label>
                </div>
                <div className="text-[11px] text-slate-500">
                    {onlyWithBalance
                        ? 'List disaring agar rekening tanpa saldo tidak ditampilkan.'
                        : 'Semua rekening Bank dan E-Wallet ditampilkan, termasuk yang saldonya masih kosong.'}
                </div>
            </section>

            <section className="space-y-3">
                {filteredAccounts.length === 0 ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                        Belum ada rekening Bank atau E-Wallet untuk filter ini.
                    </div>
                ) : filteredAccounts.map((account) => {
                    const ownerEntries = Object.entries(account.ownerBalances || {}).filter(([, amount]) => Number(amount) !== 0);
                    const preferredOwnerId = selectedOwnerId !== 'ALL'
                        ? selectedOwnerId
                        : ownerEntries[0]?.[0] || account.ownerId || owners[0]?.id || '';
                    return (
                        <div key={account.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${account.type === 'Bank' ? 'bg-blue-50 text-blue-600' : 'bg-fuchsia-50 text-fuchsia-600'}`}>
                                            {account.type === 'Bank' ? <CreditCard size={18} /> : <Smartphone size={18} />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-base font-black text-slate-900 truncate">{account.name}</p>
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                                {account.type} • Owner rekening: {ownerNameById[account.ownerId || ''] || '-'}
                                            </p>
                                        </div>
                                    </div>
                                    {account.accountNumber ? (
                                        <p className="mt-3 text-xs text-slate-500">No. rekening: {account.accountNumber}</p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <p className="text-right text-lg font-black text-slate-900">{formatCurrency(Number(account.balance || 0))}</p>
                                    {canLaunchAccountApp(account) ? (
                                        <button
                                            type="button"
                                            onClick={() => void launchAccountApp(account)}
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                            title="Buka aplikasi rekening"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            {ownerEntries.length > 0 ? (
                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {ownerEntries.map(([ownerId, amount]) => (
                                        <div key={`${account.id}-${ownerId}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{ownerNameById[ownerId] || ownerId}</p>
                                            <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(Number(amount || 0))}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-4 text-xs text-slate-400">Belum ada rincian kepemilikan di rekening ini.</p>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => openModal('TRANSFER', {
                                        ownerId: preferredOwnerId,
                                        sourceAccountId: account.id
                                    })}
                                    className="rounded-2xl bg-blue-50 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-blue-700 transition-colors hover:bg-blue-100"
                                >
                                    Transfer Dari Sini
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openModal('TOP_UP', {
                                        ownerId: preferredOwnerId,
                                        sourceAccountId: account.id
                                    })}
                                    className="rounded-2xl bg-fuchsia-50 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                                >
                                    Top Up Dari Sini
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openModal('TRANSFER', {
                                        ownerId: preferredOwnerId,
                                        destinationAccountId: account.id
                                    })}
                                    className="rounded-2xl bg-emerald-50 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100"
                                >
                                    Terima Ke Sini
                                </button>
                            </div>
                        </div>
                    );
                })}
            </section>
        </div>
    );
};

export default CashAccounts;
