import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migratePendingNotifications() {
    // Find PENDING notifications that have a type and amount but NO linked transaction
    const orphanNotifications = await prisma.notificationInbox.findMany({
        where: {
            parseStatus: { not: 'IGNORED' },
            parsedType: { not: null },
            parsedAmount: { not: null },
            transaction: null  // No transaction linked yet
        },
        orderBy: { receivedAt: 'asc' }
    });

    console.log(`Found ${orphanNotifications.length} notifications without transactions.`);

    for (const notif of orphanNotifications) {
        try {
            // Find owner (first available)
            const owner = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
            const activity = await prisma.activity.findFirst({ where: { name: 'Lainnya' } })
                || await prisma.activity.findFirst({ orderBy: { createdAt: 'asc' } });

            if (!owner || !activity) {
                console.log(`Skipping ${notif.id}: no owner or activity found`);
                continue;
            }

            // Try to find an account by hint
            const findAccount = async (hint) => {
                if (!hint) return null;
                return prisma.account.findFirst({
                    where: {
                        OR: [
                            { name: { contains: hint, mode: 'insensitive' } },
                            { type: { contains: hint, mode: 'insensitive' } },
                            { accountNumber: { contains: hint, mode: 'insensitive' } }
                        ]
                    },
                    orderBy: { createdAt: 'asc' }
                });
            };

            const account = await findAccount(notif.parsedAccountHint)
                || await findAccount(notif.sourceApp)
                || await prisma.account.findFirst({ orderBy: { createdAt: 'asc' } });

            let sourceAccountId = null;
            let destinationAccountId = null;

            if (notif.parsedType === 'INCOME') {
                destinationAccountId = account?.id;
            } else if (notif.parsedType === 'EXPENSE' || notif.parsedType === 'INVESTMENT_OUT') {
                sourceAccountId = account?.id;
            } else if (notif.parsedType === 'TRANSFER' || notif.parsedType === 'TOP_UP') {
                sourceAccountId = account?.id;
                // For transfer, try to find a different destination account
                const otherAccount = await prisma.account.findFirst({
                    where: { id: { not: account?.id } },
                    orderBy: { createdAt: 'asc' }
                });
                destinationAccountId = otherAccount?.id;
            }

            // Skip if TRANSFER but can't find 2 distinct accounts
            if ((notif.parsedType === 'TRANSFER' || notif.parsedType === 'TOP_UP') && (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId)) {
                // Create as EXPENSE to allow user to fix it via the ✓ button
                sourceAccountId = account?.id;
                destinationAccountId = null;
                const expenseActivity = await prisma.activity.findFirst({ where: { name: 'Pengeluaran' } }) || activity;

                const tx = await prisma.transaction.create({
                    data: {
                        amount: notif.parsedAmount,
                        type: 'EXPENSE',
                        date: notif.receivedAt,
                        description: `[Notif Auto] ${notif.parsedDescription || notif.messageText}`.slice(0, 190),
                        ownerId: owner.id,
                        activityId: expenseActivity.id,
                        isValidated: false,
                        notificationInboxId: notif.id,
                        sourceAccountId: sourceAccountId || undefined
                    }
                });
                console.log(`Created EXPENSE tx for TRANSFER notification ${notif.id}: ${tx.id}`);
                continue;
            }

            const tx = await prisma.transaction.create({
                data: {
                    amount: notif.parsedAmount,
                    type: notif.parsedType,
                    date: notif.receivedAt,
                    description: `[Notif Auto] ${notif.parsedDescription || notif.messageText}`.slice(0, 190),
                    ownerId: owner.id,
                    activityId: activity.id,
                    isValidated: false,
                    notificationInboxId: notif.id,
                    ...(sourceAccountId ? { sourceAccountId } : {}),
                    ...(destinationAccountId ? { destinationAccountId } : {})
                }
            });

            console.log(`Created pending tx for notif ${notif.id}: tx=${tx.id}, type=${notif.parsedType}, amount=${notif.parsedAmount}`);
        } catch (err) {
            console.error(`Error migrating ${notif.id}: ${err.message}`);
        }
    }

    console.log('Migration done!');
    await prisma.$disconnect();
}

migratePendingNotifications().catch(console.error);
