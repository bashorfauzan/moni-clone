import { TransactionType } from '@prisma/client';

export const normalizeTransactionType = (type: TransactionType) =>
    type === TransactionType.TOP_UP ? TransactionType.TRANSFER : type;

export const isLegacyInvestmentTransactionType = (type: TransactionType) =>
    type === TransactionType.INVESTMENT_IN || type === TransactionType.INVESTMENT_OUT;

export const isSourceOnlyTransactionType = (type: TransactionType) =>
    normalizeTransactionType(type) === TransactionType.EXPENSE;

export const isDualAccountTransactionType = (type: TransactionType) =>
    normalizeTransactionType(type) === TransactionType.TRANSFER;

export const shouldReduceTargetsForTransaction = (_type: TransactionType) => false;

export const getDefaultActivityName = (type: TransactionType) => {
    const normalized = normalizeTransactionType(type);
    if (normalized === TransactionType.INCOME) return 'Pemasukan';
    if (normalized === TransactionType.EXPENSE) return 'Pengeluaran';
    return 'Transfer';
};
