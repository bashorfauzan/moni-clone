import express from 'express';
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';

const router = express.Router();
const prisma = new PrismaClient();

const ensurePrimaryOwner = async () => {
    const existing = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return prisma.owner.create({ data: { name: 'Owner Utama' } });
};

const isMissingTableError = (error: any) => error?.code === 'P2021';

router.get('/meta', async (_req, res) => {
    try {
        await ensurePrimaryOwner();
        const [owners, accounts, activities] = await Promise.all([
            prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.account.findMany({ orderBy: { createdAt: 'desc' } }),
            prisma.activity.findMany({ orderBy: { createdAt: 'desc' } })
        ]);
        res.json({ owners, accounts, activities });
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil master data' });
    }
});

router.get('/export-excel', async (_req, res) => {
    try {
        const [owners, accounts, activities, targets, transactions] = await Promise.all([
            prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.account.findMany({ include: { owner: true }, orderBy: { createdAt: 'asc' } }),
            prisma.activity.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.target.findMany({ include: { owner: true }, orderBy: { createdAt: 'asc' } }),
            prisma.transaction.findMany({
                include: {
                    owner: true,
                    sourceAccount: { include: { owner: true } },
                    destinationAccount: { include: { owner: true } },
                    activity: true
                },
                orderBy: { date: 'desc' }
            })
        ]);

        const wb = XLSX.utils.book_new();

        const ownerRows = owners.map((owner, idx) => ({
            No: idx + 1,
            Nama: owner.name,
            'Dibuat Pada': owner.createdAt
        }));
        const accountRows = accounts.map((acc, idx) => ({
            No: idx + 1,
            Pemilik: acc.owner?.name || '',
            Nama: acc.name,
            Tipe: acc.type,
            Saldo: acc.balance
        }));
        const activityRows = activities.map((activity, idx) => ({
            No: idx + 1,
            Kategori: activity.name
        }));
        const targetRows = targets.map((target, idx) => ({
            No: idx + 1,
            Pemilik: target.owner?.name || '',
            Target: target.title,
            Periode: target.period,
            Total: target.totalAmount,
            Sisa: target.remainingAmount,
            Aktif: target.isActive ? 'Ya' : 'Tidak'
        }));
        
        const typeMap: Record<string, string> = {
            INCOME: 'Pemasukan',
            EXPENSE: 'Pengeluaran',
            TRANSFER: 'Transfer',
            INVESTMENT_IN: 'Investasi Masuk',
            INVESTMENT_OUT: 'Investasi Keluar'
        };

        const transactionRows = transactions.map((tx, idx) => ({
            No: idx + 1,
            Tanggal: new Date(tx.date).toLocaleDateString('id-ID'),
            Tipe: typeMap[tx.type] || tx.type,
            Nominal: tx.amount,
            'Pelaku Transaksi': tx.owner?.name || '',
            'Rekening Asal': tx.sourceAccount ? `${tx.sourceAccount.name} (${tx.sourceAccount.owner?.name || '-'})` : '-',
            'Rekening Tujuan': tx.destinationAccount ? `${tx.destinationAccount.name} (${tx.destinationAccount.owner?.name || '-'})` : '-',
            Kategori: tx.activity?.name || '-',
            Catatan: tx.description || '-'
        }));

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ownerRows), 'Pemilik');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountRows), 'Rekening');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activityRows), 'Kategori');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(targetRows), 'Targets');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactionRows), 'Transaksi');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const filename = `moni-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: 'Gagal export data' });
    }
});

router.get('/export-backup', async (req, res) => {
    try {
        const includeNotifications = req.query.includeNotifications !== '0';

        const [owners, accounts, activities, budgets, targets, transactions, notifications] = await Promise.all([
            prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.activity.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.budget.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.target.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.transaction.findMany({ orderBy: { createdAt: 'asc' } }),
            includeNotifications
                ? prisma.notificationInbox.findMany({ orderBy: { receivedAt: 'asc' } })
                : Promise.resolve([])
        ]);

        const payload = {
            meta: {
                exportedAt: new Date().toISOString(),
                app: 'SPEND',
                version: 1,
                includeNotifications
            },
            data: {
                owners,
                accounts,
                activities,
                budgets,
                targets,
                transactions,
                notifications
            }
        };

        const filename = `spend-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
        res.status(500).json({ error: 'Gagal membuat file backup' });
    }
});

router.post('/accounts', async (req, res) => {
    const { name, type, balance, ownerId, accountNumber } = req.body;

    if (!name || !type) {
        return res.status(400).json({ error: 'Nama dan tipe wajib diisi' });
    }

    try {
        const selectedOwnerId = ownerId ? String(ownerId) : (await ensurePrimaryOwner()).id;
        const account = await prisma.account.create({
            data: {
                name: String(name),
                type: String(type),
                accountNumber: accountNumber ? String(accountNumber) : null,
                ownerId: selectedOwnerId,
                balance: Number.isFinite(Number(balance)) ? Number(balance) : 0
            }
        });
        res.status(201).json(account);
    } catch (error) {
        res.status(400).json({ error: 'Gagal menambah rekening' });
    }
});

router.put('/accounts/:id', async (req, res) => {
    const { name, type, balance, accountNumber } = req.body;

    try {
        const data: { name?: string; type?: string; balance?: number; accountNumber?: string | null } = {};
        if (name !== undefined) data.name = String(name);
        if (type !== undefined) data.type = String(type);
        if (balance !== undefined && Number.isFinite(Number(balance))) data.balance = Number(balance);
        if (accountNumber !== undefined) data.accountNumber = accountNumber ? String(accountNumber) : null;

        const account = await prisma.account.update({
            where: { id: req.params.id },
            data
        });
        res.json(account);
    } catch (error) {
        res.status(400).json({ error: 'Gagal mengubah rekening' });
    }
});

router.delete('/accounts/:id', async (req, res) => {
    try {
        await prisma.account.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (error: any) {
        if (error?.code === 'P2003') {
            return res.status(409).json({ error: 'Rekening sudah dipakai transaksi, tidak bisa dihapus' });
        }
        res.status(400).json({ error: 'Gagal menghapus rekening' });
    }
});

router.post('/activities', async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }

    try {
        const activity = await prisma.activity.create({
            data: { name: String(name) }
        });
        res.status(201).json(activity);
    } catch (error) {
        res.status(400).json({ error: 'Gagal menambah kategori' });
    }
});

router.put('/activities/:id', async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }

    try {
        const activity = await prisma.activity.update({
            where: { id: req.params.id },
            data: { name: String(name) }
        });
        res.json(activity);
    } catch (error) {
        res.status(400).json({ error: 'Gagal mengubah kategori' });
    }
});

router.delete('/activities/:id', async (req, res) => {
    try {
        await prisma.activity.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (error: any) {
        if (error?.code === 'P2003') {
            return res.status(409).json({ error: 'Kategori sudah dipakai transaksi, tidak bisa dihapus' });
        }
        res.status(400).json({ error: 'Gagal menghapus kategori' });
    }
});

router.post('/owners', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama pemilik wajib diisi' });
    try {
        const owner = await prisma.owner.create({ data: { name: String(name) } });
        res.status(201).json(owner);
    } catch (error) {
        res.status(400).json({ error: 'Gagal menambah pemilik' });
    }
});

router.put('/owners/:id', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama pemilik wajib diisi' });
    try {
        const owner = await prisma.owner.update({
            where: { id: req.params.id },
            data: { name: String(name) }
        });
        res.json(owner);
    } catch (error) {
        res.status(400).json({ error: 'Gagal mengubah pemilik' });
    }
});

router.delete('/owners/:id', async (req, res) => {
    try {
        await prisma.owner.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (error: any) {
        res.status(400).json({ error: 'Gagal menghapus pemilik. Pastikan tidak ada rekening atau transaksi yang terkait dengannya.' });
    }
});

router.post('/reset-data', async (req, res) => {
    const { 
        resetTransactions, 
        resetNotifications, 
        resetTargets, 
        resetAccounts, 
        resetActivities, 
        resetOwners 
    } = req.body;

    try {
        await prisma.$transaction(async (trx) => {
            // 1. Children / derived records
            if (resetTransactions) {
                await trx.transaction.deleteMany({});
            }

            if (resetNotifications || resetTransactions) {
                await trx.notificationInbox.deleteMany({});
            }

            if (resetTargets) {
                try {
                    await trx.target.deleteMany({});
                } catch (error: any) {
                    if (!isMissingTableError(error)) throw error;
                }

                try {
                    await trx.budget.deleteMany({});
                } catch (error: any) {
                    if (!isMissingTableError(error)) throw error;
                }
            } else if (resetTransactions) {
                try {
                    const targets = await trx.target.findMany({
                        select: { id: true, totalAmount: true }
                    });

                    for (const target of targets) {
                        await trx.target.update({
                            where: { id: target.id },
                            data: {
                                remainingAmount: target.totalAmount,
                                isActive: true
                            }
                        });
                    }
                } catch (error: any) {
                    if (!isMissingTableError(error)) throw error;
                }
            }

            if (resetTransactions && !resetAccounts) {
                await trx.account.updateMany({
                    data: { balance: 0 }
                });
            }

            // 2. Parents
            if (resetAccounts) {
                await trx.account.deleteMany({});
            }

            if (resetActivities) {
                await trx.activity.deleteMany({});
            }

            // 3. Grandparent
            if (resetOwners) {
                await trx.owner.deleteMany({});
            }
        });

        if (resetOwners) {
            await ensurePrimaryOwner();
        }

        res.json({ ok: true });
    } catch (error: any) {
        console.error('Error resetting data:', error);
        if (error?.code === 'P2003') {
            return res.status(409).json({ error: 'Gagal mereset data karena beberapa data masih berelasi (misalnya: tidak dapat menghapus rekening jika masih ada transaksi).' });
        }
        res.status(500).json({ error: 'Gagal mereset data' });
    }
});

export default router;
