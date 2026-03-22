import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Memulai Seeding ---');

    try {
        const owner = await prisma.owner.upsert({
            where: { id: 'bashor-id-1' },
            update: {},
            create: { id: 'bashor-id-1', name: 'Bashor Fauzan' }
        });
        console.log('Owner seeded:', owner.name);

        const activity = await prisma.activity.upsert({
            where: { id: 'activity-default-1' },
            update: { name: 'Lainnya' },
            create: { id: 'activity-default-1', name: 'Lainnya' }
        });
        console.log('Activity seeded:', activity.name);

        const account = await prisma.account.upsert({
            where: { id: 'account-bca-1' },
            update: {
                name: 'BCA Utama',
                type: 'Bank',
                accountNumber: 'BCA'
            },
            create: {
                id: 'account-bca-1',
                name: 'BCA Utama',
                type: 'Bank',
                accountNumber: 'BCA',
                balance: 0,
                ownerId: owner.id
            }
        });
        console.log('Account seeded:', account.name);

        const budget = await prisma.budget.upsert({
            where: { id: 'budget-bashor-1' },
            update: { amount: 5000000 },
            create: {
                id: 'budget-bashor-1',
                amount: 5000000,
                period: 'Monthly',
                ownerId: owner.id
            }
        });
        console.log('Budget seeded:', budget.amount);

        const yearlyTarget = await prisma.target.upsert({
            where: { id: 'target-bashor-yearly-1' },
            update: {},
            create: {
                id: 'target-bashor-yearly-1',
                title: 'Tagihan Operasional Tahunan',
                totalAmount: 120000000,
                remainingAmount: 120000000,
                period: 'YEARLY',
                ownerId: owner.id
            }
        });
        console.log('Target seeded:', yearlyTarget.title);

    } catch (err) {
        console.error('KESALAHAN SEEDING:', err);
        throw err;
    }
}

main()
    .catch((e) => {
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
