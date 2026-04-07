import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Resetting transactions...');
    
    // Reverse balances calculation is not needed since we want to clear everything and start fresh
    // So we just set all account balances to 0
    await prisma.account.updateMany({
        data: { balance: 0 }
    });

    // Delete all Notification Inboxes (optional, to avoid pending approvals lying around)
    await prisma.notificationInbox.deleteMany();

    // Delete all Transactions
    await prisma.transaction.deleteMany();

    console.log('All transactions and notifications deleted. Account balances reset to 0.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
