import { TransactionType, type Prisma } from '@prisma/client';
import {
    isDualAccountTransactionType,
    isLegacyInvestmentTransactionType,
    isSourceOnlyTransactionType,
    normalizeTransactionType
} from './transactionRules.js';

type PrismaExecutor = Prisma.TransactionClient | Prisma.DefaultPrismaClient;
const BUY_SELL_SIDES = {
    BUY: -1,
    SELL: 1
} as const;

export const computeValidatedAccountBalances = async (db: PrismaExecutor) => {
    const [accounts, transactions, stockTransactions, ipoTransactions] = await Promise.all([
        db.account.findMany({
            select: { id: true }
        }),
        db.transaction.findMany({
            where: { isValidated: true },
            select: {
                type: true,
                amount: true,
                sourceAccountId: true,
                destinationAccountId: true
            }
        }),
        db.stockTransaction.findMany({
            select: {
                side: true,
                netValue: true,
                accountId: true
            }
        }),
        db.ipoTransaction.findMany({
            select: {
                side: true,
                netValue: true,
                accountId: true
            }
        })
    ]);

    const balanceMap = new Map<string, number>();

    for (const account of accounts) {
        balanceMap.set(account.id, 0);
    }

    for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        if (!Number.isFinite(amount) || amount === 0) continue;
        if (isLegacyInvestmentTransactionType(tx.type)) continue;

        if (
            normalizeTransactionType(tx.type) === TransactionType.INCOME
            && tx.destinationAccountId
        ) {
            balanceMap.set(
                tx.destinationAccountId,
                (balanceMap.get(tx.destinationAccountId) || 0) + amount
            );
        }

        if (
            isSourceOnlyTransactionType(tx.type)
            && tx.sourceAccountId
        ) {
            balanceMap.set(
                tx.sourceAccountId,
                (balanceMap.get(tx.sourceAccountId) || 0) - amount
            );
        }

        if (isDualAccountTransactionType(tx.type)) {
            if (tx.sourceAccountId) {
                balanceMap.set(
                    tx.sourceAccountId,
                    (balanceMap.get(tx.sourceAccountId) || 0) - amount
                );
            }

            if (tx.destinationAccountId) {
                balanceMap.set(
                    tx.destinationAccountId,
                    (balanceMap.get(tx.destinationAccountId) || 0) + amount
                );
            }
        }
    }

    for (const tx of stockTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!Number.isFinite(amount) || amount === 0 || !tx.accountId) continue;
        const multiplier = BUY_SELL_SIDES[tx.side];
        balanceMap.set(
            tx.accountId,
            (balanceMap.get(tx.accountId) || 0) + (amount * multiplier)
        );
    }

    for (const tx of ipoTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!Number.isFinite(amount) || amount === 0 || !tx.accountId) continue;
        const multiplier = BUY_SELL_SIDES[tx.side];
        balanceMap.set(
            tx.accountId,
            (balanceMap.get(tx.accountId) || 0) + (amount * multiplier)
        );
    }

    return balanceMap;
};

export const syncAccountBalances = async (db: PrismaExecutor) => {
    const balanceMap = await computeValidatedAccountBalances(db);

    await Promise.all(
        Array.from(balanceMap.entries()).map(([accountId, balance]) =>
            db.account.update({
                where: { id: accountId },
                data: { balance }
            })
        )
    );

    return balanceMap;
};

export const computeOwnerAccountBalances = async (db: PrismaExecutor) => {
    const [accounts, transactions, stockTransactions, ipoTransactions] = await Promise.all([
        db.account.findMany({
            select: { id: true }
        }),
        db.transaction.findMany({
            where: { isValidated: true },
            select: {
                type: true,
                amount: true,
                ownerId: true,
                sourceAccountId: true,
                destinationAccountId: true
            }
        }),
        db.stockTransaction.findMany({
            select: {
                side: true,
                netValue: true,
                accountId: true,
                ownerId: true
            }
        }),
        db.ipoTransaction.findMany({
            select: {
                side: true,
                netValue: true,
                accountId: true,
                ownerId: true
            }
        })
    ]);

    const ownerBalanceMap = new Map<string, Map<string, number>>();

    for (const account of accounts) {
        ownerBalanceMap.set(account.id, new Map<string, number>());
    }

    const adjust = (accountId: string, ownerId: string, delta: number) => {
        const accMap = ownerBalanceMap.get(accountId);
        if (!accMap) return;
        accMap.set(ownerId, (accMap.get(ownerId) || 0) + delta);
    };

    for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        if (!Number.isFinite(amount) || amount === 0) continue;
        if (isLegacyInvestmentTransactionType(tx.type)) continue;

        if (
            normalizeTransactionType(tx.type) === TransactionType.INCOME
            && tx.destinationAccountId
        ) {
            adjust(tx.destinationAccountId, tx.ownerId, amount);
        }

        if (
            isSourceOnlyTransactionType(tx.type)
            && tx.sourceAccountId
        ) {
            adjust(tx.sourceAccountId, tx.ownerId, -amount);
        }

        if (isDualAccountTransactionType(tx.type)) {
            if (tx.sourceAccountId) {
                adjust(tx.sourceAccountId, tx.ownerId, -amount);
            }

            if (tx.destinationAccountId) {
                adjust(tx.destinationAccountId, tx.ownerId, amount);
            }
        }
    }

    const BUY_SELL_SIDES = {
        BUY: -1,
        SELL: 1
    } as const;

    for (const tx of stockTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!Number.isFinite(amount) || amount === 0 || !tx.accountId) continue;
        const multiplier = BUY_SELL_SIDES[tx.side];
        adjust(tx.accountId, tx.ownerId, amount * multiplier);
    }

    for (const tx of ipoTransactions) {
        const amount = Number(tx.netValue || 0);
        if (!Number.isFinite(amount) || amount === 0 || !tx.accountId) continue;
        const multiplier = BUY_SELL_SIDES[tx.side];
        adjust(tx.accountId, tx.ownerId, amount * multiplier);
    }

    const result = new Map<string, Record<string, number>>();
    for (const [accountId, accMap] of ownerBalanceMap.entries()) {
        const obj: Record<string, number> = {};
        for (const [ownerId, val] of accMap.entries()) {
            obj[ownerId] = val;
        }
        result.set(accountId, obj);
    }

    return result;
};

export const getOwnerAccountBalance = async (
    db: PrismaExecutor,
    accountId: string,
    ownerId: string,
    excludeTransactionId?: string
) => {
    const whereClause: Prisma.TransactionWhereInput = {
        isValidated: true,
        ownerId,
        OR: [
            { sourceAccountId: accountId },
            { destinationAccountId: accountId }
        ]
    };
    if (excludeTransactionId) {
        whereClause.NOT = { id: excludeTransactionId };
    }

    const [transactions, stockTransactions, ipoTransactions] = await Promise.all([
        db.transaction.findMany({
            where: whereClause,
            select: {
                type: true,
                amount: true,
                sourceAccountId: true,
                destinationAccountId: true
            }
        }),
        db.stockTransaction.findMany({
            where: { ownerId, accountId },
            select: { side: true, netValue: true }
        }),
        db.ipoTransaction.findMany({
            where: { ownerId, accountId },
            select: { side: true, netValue: true }
        })
    ]);

    let balance = 0;
    for (const tx of transactions) {
        const amount = Number(tx.amount || 0);
        if (normalizeTransactionType(tx.type) === TransactionType.INCOME && tx.destinationAccountId === accountId) {
            balance += amount;
        } else if (isSourceOnlyTransactionType(tx.type) && tx.sourceAccountId === accountId) {
            balance -= amount;
        } else if (isDualAccountTransactionType(tx.type)) {
            if (tx.destinationAccountId === accountId) balance += amount;
            if (tx.sourceAccountId === accountId) balance -= amount;
        }
    }

    const BUY_SELL_SIDES = {
        BUY: -1,
        SELL: 1
    } as const;

    for (const tx of stockTransactions) {
        balance += Number(tx.netValue || 0) * BUY_SELL_SIDES[tx.side];
    }

    for (const tx of ipoTransactions) {
        balance += Number(tx.netValue || 0) * BUY_SELL_SIDES[tx.side];
    }

    return balance;
};
