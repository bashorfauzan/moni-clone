type TransactionAccountRefs = {
    sourceAccountId?: string;
    destinationAccountId?: string;
};

type AccountWithUsageFields = {
    id: string;
    name: string;
    balance: number;
};

export type AccountUsageFrequency = Record<string, number>;

export const buildAccountUsageFrequency = (
    transactions: TransactionAccountRefs[]
): AccountUsageFrequency => {
    const frequency: AccountUsageFrequency = {};

    transactions.forEach((transaction) => {
        if (transaction.sourceAccountId) {
            frequency[transaction.sourceAccountId] = (frequency[transaction.sourceAccountId] || 0) + 1;
        }

        if (transaction.destinationAccountId) {
            frequency[transaction.destinationAccountId] = (frequency[transaction.destinationAccountId] || 0) + 1;
        }
    });

    return frequency;
};

export const sortAccountsByUsage = <T extends AccountWithUsageFields>(
    accounts: T[],
    frequency: AccountUsageFrequency
) => (
    [...accounts].sort((left, right) => {
        const leftUsage = frequency[left.id] || 0;
        const rightUsage = frequency[right.id] || 0;

        if (leftUsage !== rightUsage) {
            return rightUsage - leftUsage;
        }

        if (left.balance !== right.balance) {
            return right.balance - left.balance;
        }

        return left.name.localeCompare(right.name, 'id-ID');
    })
);
