const fs = require('fs');
const path = './server/routes/transaction.ts';
let code = fs.readFileSync(path, 'utf8');

const deleteRoute = `
// Endpoint untuk Menghapus Transaksi
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.$transaction(async (trx) => {
            const txToDelete = await trx.transaction.findUnique({ where: { id } });
            if (!txToDelete) {
                throw new Error('Transaksi tidak ditemukan');
            }

            // Rollback saldo
            if (txToDelete.isValidated) {
                if (txToDelete.type === TransactionType.INCOME && txToDelete.destinationAccountId) {
                    await trx.account.update({
                        where: { id: txToDelete.destinationAccountId },
                        data: { balance: { decrement: txToDelete.amount } }
                    });
                } else if ((txToDelete.type === TransactionType.EXPENSE || txToDelete.type === TransactionType.INVESTMENT_OUT) && txToDelete.sourceAccountId) {
                    await trx.account.update({
                        where: { id: txToDelete.sourceAccountId },
                        data: { balance: { increment: txToDelete.amount } }
                    });
                } else if (txToDelete.type === TransactionType.TRANSFER && txToDelete.sourceAccountId && txToDelete.destinationAccountId) {
                    await trx.account.update({
                        where: { id: txToDelete.sourceAccountId },
                        data: { balance: { increment: txToDelete.amount } }
                    });
                    await trx.account.update({
                        where: { id: txToDelete.destinationAccountId },
                        data: { balance: { decrement: txToDelete.amount } }
                    });
                }
            }

            // Hapus dari system
            await trx.transaction.delete({ where: { id } });
        });

        res.json({ message: 'Transaksi berhasil dihapus' });
    } catch (error) {
        console.error('Delete transaction error:', error);
        const message = error instanceof Error ? error.message : 'Gagal menghapus transaksi';
        res.status(400).json({ error: message });
    }
});
`;

if (!code.includes("router.delete('/:id'")) {
    code = code.replace("export default router;", deleteRoute + "\nexport default router;");
    fs.writeFileSync(path, code);
    console.log("Delete route added.");
} else {
    console.log("Delete route already exists.");
}

