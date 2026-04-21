import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Memulai Seeding ---');

    try {
        // 1. Seed Owners
        const ownersData = [
            { id: 'bashor-fauzan', name: 'Bashor Fauzan' },
            { id: 'novan-visia', name: 'Novan Visia' },
            { id: 'niswa', name: 'Niswa' },
            { id: 'fatih', name: 'Fatih' },
        ];

        for (const owner of ownersData) {
            await prisma.owner.upsert({
                where: { id: owner.id },
                update: { name: owner.name },
                create: owner,
            });
        }
        console.log('Owners seeded');

        // 2. Seed Activities
        const activitiesData = [
            { id: 'act-transfer', name: 'Transfer' },
            { id: 'act-withdraw', name: 'Withdraw' },
            { id: 'act-income', name: 'Income' },
            { id: 'act-expense', name: 'Expense' },
            { id: 'act-others', name: 'Lainnya' },
        ];

        for (const activity of activitiesData) {
            await prisma.activity.upsert({
                where: { id: activity.id },
                update: { name: activity.name },
                create: activity,
            });
        }
        console.log('Activities seeded');

        // 3. Seed Accounts
        const accountsData = [
            // Bank Accounts
            { id: 'acc-bni-bashor', name: 'BNI Bashor', type: 'Bank', accountNumber: '0356-3004-86', ownerId: 'bashor-fauzan' },
            { id: 'acc-bni-novan', name: 'BNI Novan', type: 'Bank', accountNumber: '1351-2558-72', ownerId: 'novan-visia' },
            { id: 'acc-bca-s-bashor', name: 'BCA S Bashor', type: 'Bank', accountNumber: '053-0030-634', ownerId: 'bashor-fauzan' },
            { id: 'acc-bca-s-novan', name: 'BCA S Novan', type: 'Bank', accountNumber: '053-1031-193', ownerId: 'novan-visia' },
            { id: 'acc-bca-s-niswa', name: 'BCA S Niswa', type: 'Bank', accountNumber: '053-0067-412', ownerId: 'niswa' },
            { id: 'acc-bsi-novan', name: 'BSI Novan', type: 'Bank', accountNumber: '731-9632-527', ownerId: 'novan-visia' },
            { id: 'acc-bri-bashor', name: 'BRI Bashor', type: 'Bank', accountNumber: '7900-01-009621-53-3', ownerId: 'bashor-fauzan' },
            { id: 'acc-bca-bashor', name: 'BCA Bashor', type: 'Bank', accountNumber: '315-195-6406', ownerId: 'bashor-fauzan' },
            { id: 'acc-bsi-bashor', name: 'BSI Bashor', type: 'Bank', accountNumber: '5272-3098-00', ownerId: 'bashor-fauzan' },

            // RDN Accounts (Mapping to Bashor if not specified, assuming primary owner)
            { id: 'acc-rhb-syariah', name: 'RHB Syariah', type: 'RDN', accountNumber: '001-0466-167', ownerId: 'bashor-fauzan' },
            { id: 'acc-rhb-k-bashor', name: 'RHB K Bashor', type: 'RDN', accountNumber: '992-8503-442', ownerId: 'bashor-fauzan' },
            { id: 'acc-rhb-k-novan', name: 'RHB K Novan', type: 'RDN', accountNumber: '994-0290-012', ownerId: 'novan-visia' },
            { id: 'acc-bri-sekuritas', name: 'BRI Sekuritas', type: 'RDN', accountNumber: '0671-01-481612-50-0', ownerId: 'bashor-fauzan' },
            { id: 'acc-sinarmas', name: 'Sinarmas', type: 'RDN', accountNumber: '001-7335-871', ownerId: 'bashor-fauzan' },
            { id: 'acc-philip-sekuritas', name: 'Philip Sekuritas', type: 'RDN', accountNumber: '001-0469-328', ownerId: 'bashor-fauzan' },
            { id: 'acc-stockbit', name: 'Stockbit Sekuritas', type: 'RDN', accountNumber: '1110-4977-9994', ownerId: 'bashor-fauzan' },
            { id: 'acc-ciptadana', name: 'Ciptadana Sekuritas', type: 'RDN', accountNumber: '495-3379-620', ownerId: 'bashor-fauzan' },
            { id: 'acc-ajaib', name: 'Ajaib', type: 'RDN', accountNumber: '990-0698-965', ownerId: 'bashor-fauzan' },
            { id: 'acc-semesta', name: 'Semesta Indovest', type: 'RDN', accountNumber: '540-2420-987', ownerId: 'bashor-fauzan' },
        ];

        for (const account of accountsData) {
            await prisma.account.upsert({
                where: { id: account.id },
                update: {
                    name: account.name,
                    type: account.type,
                    accountNumber: account.accountNumber,
                    ownerId: account.ownerId
                },
                create: account,
            });
        }
        console.log('Accounts seeded');

        // 4. Seed Transactions
        const transactionsData = [
            { id: 'trx-1', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 6000000, description: 'Tabungan Kaltim', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-2', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 1300000, description: 'THR Idul FItri', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-3', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 4000000, description: 'Tabungan Kaltim', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-4', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 240000, description: 'Sangu', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-5', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 2000000, description: 'Tabungan Kaltim', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-6', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 250000, description: 'Sangu', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-7', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 4500000, description: 'Tabungan Kaltim', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-8', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 430000, description: 'THR', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-9', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 4500000, description: 'Tabungan Kaltim', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-10', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 430000, description: 'THR', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-11', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 4500000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-12', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 4500000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-13', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 4650000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-14', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 4650000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-15', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 1000000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-16', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 1000000, description: 'Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-17', ownerId: 'niswa', destinationAccountId: 'acc-bni-bashor', amount: 400000, description: 'Lebaran 1446', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-18', ownerId: 'fatih', destinationAccountId: 'acc-bni-bashor', amount: 400000, description: 'Lebaran 1446', type: 'INCOME' as const, activityId: 'act-income' },

            // Data from new image
            { id: 'trx-19', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 700000, description: 'THR Informatika', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-20', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 500000, description: 'THR Fakultas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-21', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 600000, description: 'Hardiknas', type: 'INCOME' as const, activityId: 'act-income' },
            ...Array.from({ length: 11 }).map((_, i) => ({ id: `trx-gaji-bashor-1920-${i}`, ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1920500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            { id: 'trx-gaji-bashor-2017', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 2017025, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' },
            ...Array.from({ length: 12 }).map((_, i) => ({ id: `trx-gaji-novan-1920-${i}`, ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1920500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            { id: 'trx-gaji-novan-2017', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 2017025, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-prodi', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 275000, description: 'THR Prodi', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-hardiknas-novan', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 600000, description: 'Hardiknas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-bashor-univ', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1500000, description: 'THR Univ', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-bashor-fak', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 700000, description: 'THR Fakultas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-bashor-prodi', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 700000, description: 'THR Prodi', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-univ', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1500000, description: 'THR Univ', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-fak', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1000000, description: 'THR Fakultas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-prodi-2', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 300000, description: 'THR Prodi', type: 'INCOME' as const, activityId: 'act-income' },
            ...Array.from({ length: 4 }).map((_, i) => ({ id: `trx-gaji-novan-1920-group2-${i}`, ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1920500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            { id: 'trx-gaji-novan-2113', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 2113500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' },
            ...Array.from({ length: 2 }).map((_, i) => ({ id: `trx-gaji-bashor-1920-group2-${i}`, ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1920500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            ...Array.from({ length: 3 }).map((_, i) => ({ id: `trx-gaji-bashor-2113-${i}`, ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 2113500, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            ...Array.from({ length: 11 }).map((_, i) => ({ id: `trx-gaji-bashor-2613-${i}`, ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 2613550, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' })),
            { id: 'trx-thr-bashor-fak-2', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1000000, description: 'THR Fakultas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-bashor-prodi-2', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 700000, description: 'THR Prodi', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-fak-2', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1000000, description: 'THR Fakultas', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-univ-2', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1500000, description: 'THR Univ', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-thr-novan-univ-3', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1500000, description: 'THR Univ', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-km-genap', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 2281500, description: 'km genap ke-1', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-hr-koreksi', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 853125, description: 'HR koreksi UAS', type: 'INCOME' as const, activityId: 'act-income' },
            ...Array.from({ length: 15 }).map((_, i) => {
                const owner = i % 2 === 0 ? 'novan-visia' : 'bashor-fauzan';
                const account = owner === 'bashor-fauzan' ? 'acc-bni-bashor' : 'acc-bni-novan';
                return { id: `trx-gaji-misc-2613-${i}`, ownerId: owner, destinationAccountId: account, amount: 2613550, description: 'Gaji UMM', type: 'INCOME' as const, activityId: 'act-income' };
            }),
            { id: 'trx-lab-1', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 4065000, description: 'Lab', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-penelitian', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 4350000, description: 'Penelitian tahap 2', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-lab-2', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 4940000, description: 'Lab', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-lab-3', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1120000, description: 'lab', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-dash', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1120000, description: '-', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-misc-novan', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 3740000, description: '', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-bca-novan-2500', ownerId: 'novan-visia', destinationAccountId: 'acc-bca-s-novan', amount: 2500000, description: '', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-hr-wali', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 400000, description: 'HR Wali', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-zakat', ownerId: 'bashor-fauzan', sourceAccountId: 'acc-bni-bashor', amount: 200000, description: 'Zakat', type: 'EXPENSE' as const, activityId: 'act-expense' },
            { id: 'trx-pengantaran', ownerId: 'novan-visia', sourceAccountId: 'acc-bca-s-novan', destinationAccountId: 'acc-bni-novan', amount: 1500000, description: 'Pengantaran', type: 'TRANSFER' as const, activityId: 'act-transfer' },
            { id: 'trx-gaji-13-bashor', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1742400, description: 'Gaji 13', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-gaji-13-novan', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1742400, description: 'Gaji 13', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-buka-tab-bashor', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 1325000, description: 'Buka Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-buka-tab-novan', ownerId: 'novan-visia', destinationAccountId: 'acc-bni-novan', amount: 1325000, description: 'Buka Tabungan', type: 'INCOME' as const, activityId: 'act-income' },
            { id: 'trx-extra-bashor', ownerId: 'bashor-fauzan', destinationAccountId: 'acc-bni-bashor', amount: 17672500, description: '', type: 'INCOME' as const, activityId: 'act-income' },
        ].flat();

        // Karena format datanya adalah uang masuk ke rekening (penitipan dana/tabungan), 
        // kita masukkan sebagai INCOME agar menambah saldo.
        for (const trx of transactionsData) {
            await prisma.transaction.upsert({
                where: { id: trx.id },
                update: {
                    ownerId: trx.ownerId,
                    sourceAccountId: trx.sourceAccountId || null,
                    destinationAccountId: trx.destinationAccountId || null,
                    amount: trx.amount,
                    description: trx.description,
                    type: trx.type,
                    activityId: trx.activityId,
                    isValidated: true,
                    date: new Date() // Set current date or change if needed
                },
                create: {
                    id: trx.id,
                    ownerId: trx.ownerId,
                    sourceAccountId: trx.sourceAccountId || null,
                    destinationAccountId: trx.destinationAccountId || null,
                    amount: trx.amount,
                    description: trx.description,
                    type: trx.type,
                    activityId: trx.activityId,
                    isValidated: true,
                    date: new Date()
                },
            });
        }
        console.log('Transactions seeded');

    } catch (err) {
        throw err;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
