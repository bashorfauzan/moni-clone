export type TransactionTypeValue =
    | 'INCOME'
    | 'EXPENSE'
    | 'TRANSFER'
    | 'TOP_UP'
    | 'INVESTMENT_IN'
    | 'INVESTMENT_OUT';

type AccountRef = {
    type?: string;
};

type ActivityRef = {
    name?: string;
};

export type TransactionLike = {
    type?: string;
    description?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    sourceAccount?: AccountRef;
    destinationAccount?: AccountRef;
    activity?: ActivityRef;
};

export const LEGACY_HIDDEN_TRANSACTION_TYPES = ['INVESTMENT_IN', 'INVESTMENT_OUT'] as const;
export const INVESTMENT_ACCOUNT_TYPES = ['RDN', 'Sekuritas'] as const;
export const INVESTMENT_INCOME_ACTIVITY_NAMES = ['Pendapatan Sukuk', 'Pertumbuhan Saham'] as const;

export const normalizeTransactionType = (type?: string): TransactionTypeValue | undefined => {
    if (type === 'TOP_UP') return 'TRANSFER';
    if (!type) return undefined;
    return type as TransactionTypeValue;
};

export const isLegacyInvestmentTransactionType = (type?: string) =>
    type === 'INVESTMENT_IN' || type === 'INVESTMENT_OUT';

export const shouldHideLegacyInvestmentTransactionType = (type?: string) =>
    isLegacyInvestmentTransactionType(type);

export const isInvestmentAccountType = (type?: string) =>
    INVESTMENT_ACCOUNT_TYPES.some((item) => item.toLowerCase() === String(type || '').toLowerCase());

export const isInvestmentIncomeActivityName = (name?: string) =>
    INVESTMENT_INCOME_ACTIVITY_NAMES.includes((name || '') as (typeof INVESTMENT_INCOME_ACTIVITY_NAMES)[number]);

export const isTransferTransaction = (tx: TransactionLike) =>
    normalizeTransactionType(tx.type) === 'TRANSFER';

export const isInvestmentTransfer = (tx: TransactionLike) =>
    isTransferTransaction(tx) && isInvestmentAccountType(tx.destinationAccount?.type);

export const isInvestmentLiquidation = (tx: TransactionLike) =>
    isTransferTransaction(tx) && isInvestmentAccountType(tx.sourceAccount?.type);

export const isInvestmentIncome = (tx: TransactionLike) =>
    normalizeTransactionType(tx.type) === 'INCOME'
    && isInvestmentAccountType(tx.destinationAccount?.type)
    && isInvestmentIncomeActivityName(tx.activity?.name);

export const isTopUpLikeTransfer = (tx: TransactionLike) => {
    if (!isTransferTransaction(tx) || isInvestmentTransfer(tx) || isInvestmentLiquidation(tx)) return false;

    const description = `${tx.description || ''} ${tx.activity?.name || ''}`.toLowerCase();
    const destinationType = String(tx.destinationAccount?.type || '').toLowerCase();

    return description.includes('top up')
        || description.includes('topup')
        || destinationType === 'e-wallet';
};

export const requiresSourceAccount = (type?: string) => {
    const normalized = normalizeTransactionType(type);
    return normalized === 'EXPENSE' || normalized === 'TRANSFER';
};

export const requiresDestinationAccount = (type?: string) => {
    const normalized = normalizeTransactionType(type);
    return normalized === 'INCOME' || normalized === 'TRANSFER';
};

export const getDefaultActivityName = (type: TransactionTypeValue) => {
    const normalized = normalizeTransactionType(type);
    if (normalized === 'INCOME') return 'Pemasukan';
    if (normalized === 'EXPENSE') return 'Pengeluaran';
    return 'Transfer';
};
