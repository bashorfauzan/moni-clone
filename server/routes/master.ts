import express from 'express';
import { prisma } from '../lib/prisma.js';
import { computeValidatedAccountBalances, syncAccountBalances } from '../lib/accountBalances.js';
import XLSX from 'xlsx';
import { normalizeTransactionType } from '../lib/transactionRules.js';

const router = express.Router();

const ensurePrimaryOwner = async () => {
    const existing = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return prisma.owner.create({ data: { name: 'Owner Utama' } });
};

const isMissingTableError = (error: any) => error?.code === 'P2021';
const isRecordArray = (value: unknown): value is Record<string, any>[] =>
    Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item));

const asDate = (value: unknown) => {
    if (!value) return undefined;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
};

router.get('/meta', async (_req, res) => {
    try {
        await ensurePrimaryOwner();
        const [owners, accounts, activities, balanceMap] = await Promise.all([
            prisma.owner.findMany({ orderBy: { createdAt: 'asc' } }),
            prisma.account.findMany({ orderBy: { createdAt: 'desc' } }),
            prisma.activity.findMany({ orderBy: { createdAt: 'desc' } }),
            computeValidatedAccountBalances(prisma)
        ]);
        res.json({
            owners,
            accounts: accounts.map((account) => ({
                ...account,
                balance: balanceMap.get(account.id) ?? 0
            })),
            activities
        });
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
        
        const transactionRows = transactions.map((tx, idx) => ({
            No: idx + 1,
            Tanggal: new Date(tx.date).toLocaleDateString('id-ID'),
            Tipe: normalizeTransactionType(tx.type) === 'INCOME'
                ? 'Pemasukan'
                : normalizeTransactionType(tx.type) === 'EXPENSE'
                    ? 'Pengeluaran'
                    : 'Transfer',
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
        const filename = `nova-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
                app: 'NOVA',
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

        const filename = `nova-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
        res.status(500).json({ error: 'Gagal membuat file backup' });
    }
});

router.post('/restore-backup', async (req, res) => {
    const payload = req.body;
    const data = payload?.data;

    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Format file backup tidak valid' });
    }

    const owners = isRecordArray(data.owners) ? data.owners : null;
    const accounts = isRecordArray(data.accounts) ? data.accounts : null;
    const activities = isRecordArray(data.activities) ? data.activities : null;
    const budgets = isRecordArray(data.budgets) ? data.budgets : [];
    const targets = isRecordArray(data.targets) ? data.targets : [];
    const notifications = isRecordArray(data.notifications) ? data.notifications : [];
    const transactions = isRecordArray(data.transactions) ? data.transactions : null;

    if (!owners || !accounts || !activities || !transactions) {
        return res.status(400).json({ error: 'Isi file backup tidak lengkap atau rusak' });
    }

    try {
        await prisma.$transaction(async (trx) => {
            await trx.transaction.deleteMany({});
            await trx.notificationInbox.deleteMany({});
            await trx.target.deleteMany({});
            await trx.budget.deleteMany({});
            await trx.account.deleteMany({});
            await trx.activity.deleteMany({});
            await trx.owner.deleteMany({});

            if (owners.length > 0) {
                await trx.owner.createMany({
                    data: owners.map((owner: any) => ({
                        id: String(owner.id),
                        name: String(owner.name || 'Owner'),
                        createdAt: asDate(owner.createdAt),
                        updatedAt: asDate(owner.updatedAt)
                    }))
                });
            }

            if (activities.length > 0) {
                await trx.activity.createMany({
                    data: activities.map((activity: any) => ({
                        id: String(activity.id),
                        name: String(activity.name || 'Kategori'),
                        createdAt: asDate(activity.createdAt),
                        updatedAt: asDate(activity.updatedAt)
                    }))
                });
            }

            if (accounts.length > 0) {
                await trx.account.createMany({
                    data: accounts.map((account: any) => ({
                        id: String(account.id),
                        name: String(account.name || 'Rekening'),
                        type: String(account.type || 'Bank'),
                        accountNumber: account.accountNumber ? String(account.accountNumber) : null,
                        appPackageName: account.appPackageName ? String(account.appPackageName) : null,
                        appDeepLink: account.appDeepLink ? String(account.appDeepLink) : null,
                        appStoreUrl: account.appStoreUrl ? String(account.appStoreUrl) : null,
                        balance: Number(account.balance || 0),
                        ownerId: String(account.ownerId),
                        createdAt: asDate(account.createdAt),
                        updatedAt: asDate(account.updatedAt)
                    }))
                });
            }

            if (budgets.length > 0) {
                await trx.budget.createMany({
                    data: budgets.map((budget: any) => ({
                        id: String(budget.id),
                        amount: Number(budget.amount || 0),
                        period: String(budget.period || 'Monthly'),
                        ownerId: String(budget.ownerId),
                        createdAt: asDate(budget.createdAt),
                        updatedAt: asDate(budget.updatedAt)
                    }))
                });
            }

            if (targets.length > 0) {
                await trx.target.createMany({
                    data: targets.map((target: any) => ({
                        id: String(target.id),
                        title: String(target.title || 'Target'),
                        totalAmount: Number(target.totalAmount || 0),
                        remainingAmount: Number(target.remainingAmount || 0),
                        remainingMonths: Number(target.remainingMonths || 0),
                        period: target.period,
                        isActive: Boolean(target.isActive),
                        lastContributionAt: asDate(target.lastContributionAt) ?? null,
                        dueDate: asDate(target.dueDate) ?? null,
                        ownerId: String(target.ownerId),
                        createdAt: asDate(target.createdAt),
                        updatedAt: asDate(target.updatedAt)
                    }))
                });
            }

            if (notifications.length > 0) {
                await trx.notificationInbox.createMany({
                    data: notifications.map((notification: any) => ({
                        id: String(notification.id),
                        sourceApp: String(notification.sourceApp || ''),
                        senderName: notification.senderName ? String(notification.senderName) : null,
                        title: notification.title ? String(notification.title) : null,
                        messageText: String(notification.messageText || ''),
                        receivedAt: asDate(notification.receivedAt),
                        parseStatus: notification.parseStatus,
                        parsedType: notification.parsedType ?? null,
                        parsedAmount: notification.parsedAmount != null ? Number(notification.parsedAmount) : null,
                        parsedDescription: notification.parsedDescription ? String(notification.parsedDescription) : null,
                        parsedAccountHint: notification.parsedAccountHint ? String(notification.parsedAccountHint) : null,
                        confidenceScore: notification.confidenceScore != null ? Number(notification.confidenceScore) : null,
                        parseNotes: notification.parseNotes ? String(notification.parseNotes) : null,
                        rawPayload: notification.rawPayload ?? null,
                        createdAt: asDate(notification.createdAt),
                        updatedAt: asDate(notification.updatedAt)
                    }))
                });
            }

            if (transactions.length > 0) {
                await trx.transaction.createMany({
                    data: transactions.map((transaction: any) => ({
                        id: String(transaction.id),
                        date: asDate(transaction.date),
                        type: transaction.type,
                        amount: Number(transaction.amount || 0),
                        description: transaction.description ? String(transaction.description) : null,
                        isValidated: Boolean(transaction.isValidated),
                        notificationInboxId: transaction.notificationInboxId ? String(transaction.notificationInboxId) : null,
                        ownerId: String(transaction.ownerId),
                        activityId: String(transaction.activityId),
                        sourceAccountId: transaction.sourceAccountId ? String(transaction.sourceAccountId) : null,
                        destinationAccountId: transaction.destinationAccountId ? String(transaction.destinationAccountId) : null,
                        createdAt: asDate(transaction.createdAt),
                        updatedAt: asDate(transaction.updatedAt)
                    }))
                });
            }

            await syncAccountBalances(trx);
        });

        if (owners.length === 0) {
            await ensurePrimaryOwner();
        }

        res.json({
            ok: true,
            restored: {
                owners: owners.length,
                accounts: accounts.length,
                activities: activities.length,
                budgets: budgets.length,
                targets: targets.length,
                notifications: notifications.length,
                transactions: transactions.length
            }
        });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ error: 'Gagal memulihkan backup' });
    }
});

router.post('/accounts', async (req, res) => {
    const { name, type, balance, ownerId, accountNumber, appPackageName, appDeepLink, appStoreUrl } = req.body;

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
                appPackageName: appPackageName ? String(appPackageName) : null,
                appDeepLink: appDeepLink ? String(appDeepLink) : null,
                appStoreUrl: appStoreUrl ? String(appStoreUrl) : null,
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
    const { name, type, balance, ownerId, accountNumber, appPackageName, appDeepLink, appStoreUrl } = req.body;

    try {
        const data: {
            name?: string;
            type?: string;
            balance?: number;
            ownerId?: string;
            accountNumber?: string | null;
            appPackageName?: string | null;
            appDeepLink?: string | null;
            appStoreUrl?: string | null;
        } = {};
        if (name !== undefined) data.name = String(name);
        if (type !== undefined) data.type = String(type);
        if (balance !== undefined && Number.isFinite(Number(balance))) data.balance = Number(balance);
        if (ownerId !== undefined) data.ownerId = String(ownerId);
        if (accountNumber !== undefined) data.accountNumber = accountNumber ? String(accountNumber) : null;
        if (appPackageName !== undefined) data.appPackageName = appPackageName ? String(appPackageName) : null;
        if (appDeepLink !== undefined) data.appDeepLink = appDeepLink ? String(appDeepLink) : null;
        if (appStoreUrl !== undefined) data.appStoreUrl = appStoreUrl ? String(appStoreUrl) : null;

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

    const shouldResetOwners = Boolean(resetOwners);
    const shouldResetAccounts = Boolean(resetAccounts || shouldResetOwners);
    const shouldResetActivities = Boolean(resetActivities || shouldResetOwners);
    const shouldResetTargets = Boolean(resetTargets || shouldResetOwners);
    const shouldResetTransactions = Boolean(
        resetTransactions || shouldResetAccounts || shouldResetActivities || shouldResetOwners
    );
    const shouldResetNotifications = Boolean(resetNotifications || shouldResetTransactions);

    try {
        await prisma.$transaction(async (trx) => {
            // 1. Children / derived records
            if (shouldResetTransactions) {
                await trx.transaction.deleteMany({});
            }

            if (shouldResetNotifications) {
                await trx.notificationInbox.deleteMany({});
            }

            if (shouldResetTargets) {
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
            } else if (shouldResetTransactions) {
                try {
                    const targets = await trx.target.findMany({
                        select: { id: true, totalAmount: true, remainingMonths: true, dueDate: true, createdAt: true }
                    });

                    for (const target of targets) {
                        const totalMonths = target.dueDate
                            ? Math.max(1, ((target.dueDate.getFullYear() - target.createdAt.getFullYear()) * 12) + (target.dueDate.getMonth() - target.createdAt.getMonth()) + 1)
                            : Math.max(1, target.remainingMonths || 1);
                        await trx.target.update({
                            where: { id: target.id },
                            data: {
                                remainingMonths: totalMonths,
                                remainingAmount: target.totalAmount * totalMonths,
                                isActive: true
                            }
                        });
                    }
                } catch (error: any) {
                    if (!isMissingTableError(error)) throw error;
                }
            }

            if (shouldResetTransactions && !shouldResetAccounts) {
                await trx.account.updateMany({
                    data: { balance: 0 }
                });
            }

            // 2. Parents
            if (shouldResetAccounts) {
                await trx.account.deleteMany({});
            }

            if (shouldResetActivities) {
                await trx.activity.deleteMany({});
            }

            // 3. Grandparent
            if (shouldResetOwners) {
                await trx.owner.deleteMany({});
            }
        });

        if (shouldResetOwners) {
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
