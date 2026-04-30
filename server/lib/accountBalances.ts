import { TransactionType, type Prisma } from '@prisma/client';
import {
    isDualAccountTransactionType,
    isLegacyInvestmentTransactionType,
    isSourceOnlyTransactionType,
    normalizeTransactionType
} from './transactionRules.js';

type PrismaExecutor = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export const computeValidatedAccountBalances = async (db: PrismaExecutor) => {
    const [accounts, transactions] = await Promise.all([
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
