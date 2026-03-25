import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { X, ChevronDown, Search } from 'lucide-react';
import { useTransaction } from '../context/TransactionContext';
import { fetchMasterMeta } from '../services/masterData';
import { buildAccountUsageFrequency, type AccountUsageFrequency, sortAccountsByUsage } from '../services/accountUsage';
import { fetchTransactions } from '../services/transactions';
import { useSecurity } from '../context/SecurityContext';

type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';
type PickerType = 'source' | 'destination' | null;

interface ModalMeta {
    owners: Array<{ id: string; name: string }>;
    accounts: Array<{ id: string; name: string; type: string; balance: number }>;
}

const initialForm = {
    amount: '',
    description: '',
    ownerId: '',
    sourceAccountId: '',
    destinationAccountId: '',
};

const formatThousands = (raw: string) => {
    if (!raw) return '';
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('id-ID').format(numeric);
};

const sanitizeAmount = (input: string) => input.replace(/\D/g, '');
const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(value);

const TransactionModal = () => {
    const { isModalOpen, modalType, modalPayload, editTransactionId, setModalType, closeModal } = useTransaction();
    const { verifySecurity } = useSecurity();
    const [meta, setMeta] = useState<ModalMeta>({ owners: [], accounts: [] });
    const [accountUsage, setAccountUsage] = useState<AccountUsageFrequency>({});
    const [form, setForm] = useState(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [pickerType, setPickerType] = useState<PickerType>(null);
    const [pickerQuery, setPickerQuery] = useState('');
    const isEditing = Boolean(editTransactionId);

    const typeConfig = useMemo(() => {
        const config: Record<TransactionType, { title: string; accent: string; submit: string; helper: string }> = {
            INCOME: {
                title: isEditing ? 'Edit Pemasukan' : 'Tambah Pemasukan',
                accent: 'text-emerald-400',
                submit: isEditing ? 'Simpan Perubahan' : 'Simpan Pemasukan',
                helper: 'Catat dana yang masuk ke rekening tujuan.'
            },
            EXPENSE: {
                title: isEditing ? 'Edit Pengeluaran' : 'Catat Pengeluaran',
                accent: 'text-rose-400',
                submit: isEditing ? 'Simpan Perubahan' : 'Simpan Pengeluaran',
                helper: 'Pilih rekening sumber untuk mengurangi saldo.'
            },
            TRANSFER: {
                title: isEditing ? 'Edit Transfer Dana' : 'Transfer Dana',
                accent: 'text-blue-400',
                submit: isEditing ? 'Simpan Perubahan' : 'Simpan Transfer',
                helper: 'Pindahkan saldo antar rekening Anda.'
            },
            INVESTMENT: {
                title: isEditing ? 'Edit Setor ke Investasi' : 'Setor ke Investasi',
                accent: 'text-amber-400',
                submit: isEditing ? 'Simpan Perubahan' : 'Simpan Setoran',
                helper: 'Catat dana keluar untuk setor modal atau beli investasi.'
            }
        };

        return config[modalType as TransactionType] || config.EXPENSE;
    }, [isEditing, modalType]);

    useEffect(() => {
        if (!isModalOpen) {
            setForm(initialForm);
            setPickerType(null);
            setPickerQuery('');
            return;
        }

        let isActive = true;

        Promise.all([
            fetchMasterMeta(),
            fetchTransactions({ validated: true })
        ])
            .then(([payload, transactions]) => {
                if (!isActive) return;

                setMeta(payload);
                setAccountUsage(buildAccountUsageFrequency(transactions));
                setForm((prev) => ({
                    ...initialForm,
                    ownerId: modalPayload?.ownerId || payload.owners[0]?.id || prev.ownerId,
                    amount: modalPayload?.amount ? String(modalPayload.amount) : initialForm.amount,
                    description: modalPayload?.description || initialForm.description,
                    sourceAccountId: modalPayload?.sourceAccountId || initialForm.sourceAccountId,
                    destinationAccountId: modalPayload?.destinationAccountId || initialForm.destinationAccountId,
                }));
            })
            .catch((error) => {
                console.error('Error fetching modal meta:', error);
            });

        return () => {
            isActive = false;
        };
    }, [isModalOpen, modalPayload, modalType]);

    const isIncome = modalType === 'INCOME';
    const isExpense = modalType === 'EXPENSE';
    const isTransfer = modalType === 'TRANSFER';
    const isInvestment = modalType === 'INVESTMENT';

    const showSource = isExpense || isTransfer || isInvestment;
    const showDestination = isIncome || isTransfer || isInvestment;

    const accountById = (id: string) => meta.accounts.find((acc) => acc.id === id);
    const selectedSourceAccount = accountById(form.sourceAccountId);

    const filteredAccounts = useMemo(() => {
        const accounts = meta.accounts.filter((acc) => {
            const matchesQuery = acc.name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
                acc.type.toLowerCase().includes(pickerQuery.toLowerCase());

            if (!matchesQuery) return false;
            if (isEditing && pickerType === 'source' && form.sourceAccountId === acc.id) return true;
            if (isEditing && pickerType === 'destination' && form.destinationAccountId === acc.id) return true;
            if (isInvestment && pickerType === 'source') return acc.type === 'Bank' || acc.type === 'E-Wallet';
            if (isInvestment && pickerType === 'destination') return acc.type === 'RDN' || acc.type === 'Sekuritas';
            if (isIncome) return acc.type === 'Bank' || acc.type === 'E-Wallet';
            if (isExpense) return acc.type === 'Bank' || acc.type === 'E-Wallet';
            if (isTransfer && pickerType === 'source') return acc.type === 'Bank' || acc.type === 'E-Wallet';
            if (isTransfer && pickerType === 'destination') return acc.type !== 'RDN' && acc.type !== 'Sekuritas';

            return true;
        });

        return sortAccountsByUsage(accounts, accountUsage);
    }, [
        accountUsage,
        form.destinationAccountId,
        form.sourceAccountId,
        isEditing,
        isExpense,
        isIncome,
        isInvestment,
        isTransfer,
        meta.accounts,
        pickerQuery,
        pickerType
    ]);

    const openPicker = (type: PickerType) => {
        setPickerQuery('');
        setPickerType(type);
    };

    const closePicker = () => {
        setPickerType(null);
        setPickerQuery('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!form.amount || Number(form.amount) <= 0) {
            alert('Jumlah harus lebih dari 0.');
            return;
        }
        
        if (!form.ownerId) {
            alert('Owner (Kepemilikan) belum tersedia. Silakan muat ulang halaman atau tambah Owner di Pengaturan.');
            return;
        }

        if (showSource && !form.sourceAccountId) {
            alert('Pilih rekening sumber terlebih dulu.');
            return;
        }

        if (showDestination && !form.destinationAccountId) {
            alert('Pilih rekening tujuan terlebih dulu.');
            return;
        }

        if (
            showSource
            && selectedSourceAccount
            && Number(form.amount) > selectedSourceAccount.balance
        ) {
            alert(`Saldo rekening sumber tidak cukup. Sisa saldo: ${formatCurrency(selectedSourceAccount.balance)}`);
            return;
        }

        setSubmitting(true);

        // Security gate — verify PIN or biometric before saving
        const authorized = await verifySecurity('Simpan Transaksi');
        if (!authorized) {
            setSubmitting(false);
            return;
        }

        try {
            if (editTransactionId) {
                const payload = {
                    amount: Number(form.amount),
                    description: form.description,
                    ownerId: form.ownerId,
                    type: isInvestment ? 'TRANSFER' : modalType,
                    sourceAccountId: showSource ? form.sourceAccountId : undefined,
                    destinationAccountId: showDestination ? form.destinationAccountId : undefined,
                };
                await api.put(`/transactions/${editTransactionId}`, payload);
            } else if (modalPayload?.pendingTransactionId) {
                const payload = {
                    action: 'APPROVE',
                    amount: Number(form.amount),
                    description: form.description,
                    ownerId: form.ownerId,
                    type: isInvestment ? 'TRANSFER' : modalType,
                    sourceAccountId: showSource ? form.sourceAccountId : undefined,
                    destinationAccountId: showDestination ? form.destinationAccountId : undefined,
                    categoryId: undefined, // categoryId optional/will be resolved by backend
                };
                await api.put(`/transactions/${modalPayload.pendingTransactionId}/validate`, payload);
            } else {
                const payload = {
                    amount: Number(form.amount),
                    description: form.description,
                    ownerId: form.ownerId,
                    type: isInvestment ? 'TRANSFER' : modalType,
                    sourceAccountId: showSource ? form.sourceAccountId : undefined,
                    destinationAccountId: showDestination ? form.destinationAccountId : undefined,
                    notificationInboxId: modalPayload?.notificationInboxId,
                };
                await api.post('/transactions', payload);
            }

            closeModal();
            window.dispatchEvent(new Event('nova:data-changed'));
        } catch (error: any) {
            console.error('Error creating transaction:', error);
            alert(error?.response?.data?.error || 'Gagal menyimpan transaksi');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isModalOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
            onMouseDown={closeModal}
        >
            <div
                className="w-full max-h-[92vh] overflow-y-auto bg-slate-900 rounded-t-[28px] sm:rounded-3xl sm:max-w-lg border border-slate-800 p-5 sm:p-6 animate-in slide-in-from-bottom duration-300"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-5 gap-4">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">{typeConfig.title}</h2>
                        <p className={`text-xs mt-1 font-semibold ${typeConfig.accent}`}>{typeConfig.helper}</p>
                    </div>
                    <button
                        type="button"
                        onClick={closeModal}
                        className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-300"
                        aria-label="Tutup"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {(modalPayload?.pendingTransactionId || modalPayload?.notificationInboxId) && (
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">Jenis Transaksi</label>
                            <select
                                className="w-full h-12 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 text-sm text-slate-100 font-semibold"
                                value={modalType}
                                onChange={(e) => setModalType(e.target.value as TransactionType)}
                            >
                                <option value="EXPENSE">Pengeluaran</option>
                                <option value="INCOME">Pemasukan</option>
                                <option value="TRANSFER">Transfer Dana</option>
                                <option value="INVESTMENT">Setor/Investasi</option>
                            </select>
                        </div>
                    )}

                    {(isIncome || isExpense || isInvestment) && (
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">Kepemilikan</label>
                            <select
                                className="w-full h-12 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 text-sm text-slate-100"
                                value={form.ownerId}
                                onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                            >
                                {meta.owners.map((owner) => (
                                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">Jumlah (Rp)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            required
                            placeholder="0"
                            className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl h-14 px-4 text-2xl font-bold text-white focus:outline-none focus:border-blue-500/60 transition-colors"
                            value={formatThousands(form.amount)}
                            onChange={(e) => {
                                const raw = sanitizeAmount(e.target.value);
                                setForm((prev) => ({ ...prev, amount: raw }));
                            }}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">Keterangan</label>
                        <input
                            type="text"
                            placeholder={isIncome ? 'Contoh: Gaji Bulanan' : 'Contoh: Makan Siang'}
                            className="w-full bg-slate-800/60 border border-slate-700 rounded-2xl h-12 px-4 text-sm text-slate-100 focus:outline-none focus:border-blue-500/60 transition-colors"
                            value={form.description}
                            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        />
                    </div>

                    {(showSource || showDestination) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {showSource && (
                                <div className={showDestination ? '' : 'sm:col-span-2'}>
                                    <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">
                                        {isInvestment ? 'Dari Rekening' : 'Dari Rekening'}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => openPicker('source')}
                                        className="w-full h-12 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 flex items-center justify-between text-sm"
                                    >
                                        <span className={form.sourceAccountId ? 'text-slate-100' : 'text-slate-400'}>
                                            {accountById(form.sourceAccountId)?.name || 'Pilih rekening...'}
                                        </span>
                                        <ChevronDown size={16} className="text-slate-500" />
                                    </button>
                                    {selectedSourceAccount && (
                                        <p className="mt-2 px-1 text-[11px] font-medium text-slate-400">
                                            Sisa saldo: {formatCurrency(selectedSourceAccount.balance)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {showDestination && (
                                <div className={showSource ? '' : 'sm:col-span-2'}>
                                    <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 px-1">
                                        {isIncome ? 'Rekening Tujuan' : isInvestment ? 'Rekening RDN' : 'Ke Rekening'}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => openPicker('destination')}
                                        className="w-full h-12 rounded-2xl border border-slate-700 bg-slate-800/60 px-4 flex items-center justify-between text-sm"
                                    >
                                        <span className={form.destinationAccountId ? 'text-slate-100' : 'text-slate-400'}>
                                            {accountById(form.destinationAccountId)?.name || 'Pilih rekening...'}
                                        </span>
                                        <ChevronDown size={16} className="text-slate-500" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="h-12 rounded-2xl border border-slate-700 text-slate-300 text-sm font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="h-12 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            {submitting ? 'Menyimpan...' : typeConfig.submit}
                        </button>
                    </div>
                </form>
            </div>

            {pickerType && (
                <div className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm flex items-end justify-center sm:items-center p-4" onMouseDown={closePicker}>
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-4 max-h-[80vh] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-bold text-white">
                                Pilih Rekening
                            </p>
                            <button type="button" onClick={closePicker} className="p-2 text-slate-400 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={pickerQuery}
                                onChange={(e) => setPickerQuery(e.target.value)}
                                placeholder="Cari..."
                                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100"
                            />
                        </div>

                        <div className="space-y-2 overflow-y-auto max-h-[55vh]">
                            {filteredAccounts.map((item: any) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        if (pickerType === 'source') {
                                            setForm((prev) => ({ ...prev, sourceAccountId: item.id }));
                                        } else {
                                            setForm((prev) => ({ ...prev, destinationAccountId: item.id }));
                                        }
                                        closePicker();
                                    }}
                                    className="w-full text-left p-3 rounded-xl bg-slate-800/70 border border-slate-700 hover:border-blue-500/50"
                                >
                                    <p className="text-sm font-semibold text-slate-100">{item.name}</p>
                                    <p className="text-[11px] text-slate-400">
                                        {item.type}
                                        {pickerType === 'source' ? ` · ${formatCurrency(item.balance)}` : ''}
                                    </p>
                                </button>
                            ))}
                            {filteredAccounts.length === 0 && (
                                <p className="text-sm text-slate-400 italic p-2">
                                    {isInvestment
                                        ? pickerType === 'source'
                                            ? 'Belum ada rekening bank yang bisa dipilih.'
                                            : 'Belum ada rekening RDN yang bisa dipilih.'
                                        : (isIncome || isExpense)
                                            ? 'Belum ada rekening bank yang bisa dipilih.'
                                            : (isTransfer && pickerType === 'source')
                                                ? 'Rekening sumber transfer hanya bisa dari Bank atau E-Wallet.'
                                            : (isTransfer && pickerType === 'destination')
                                                ? 'Rekening tujuan transfer tidak bisa bertipe RDN.'
                                            : 'Data tidak ditemukan.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionModal;
