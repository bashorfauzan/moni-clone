import express from 'express';
import { TargetPeriod } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

const parseMonthCount = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
};

const monthCountToPeriod = (monthCount: number): TargetPeriod => {
    if (monthCount <= 1) return TargetPeriod.ONE_MONTH;
    if (monthCount <= 3) return TargetPeriod.THREE_MONTH;
    if (monthCount <= 6) return TargetPeriod.SIX_MONTH;
    if (monthCount <= 12) return TargetPeriod.YEARLY;
    if (monthCount <= 36) return TargetPeriod.THREE_YEAR;
    return TargetPeriod.FIVE_YEAR;
};

const dueDateFromMonthCount = (monthCount: number, baseDate = new Date()) => {
    const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthCount, 0);
    dueDate.setHours(23, 59, 59, 999);
    return dueDate;
};

const diffInCalendarMonthsInclusive = (startValue?: Date | null, endValue?: Date | null) => {
    if (!startValue || !endValue) return null;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const months = ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
};

const getSuggestedContributionAmount = (target: {
    totalAmount: number;
    remainingAmount: number;
    createdAt?: Date | null;
    dueDate?: Date | null;
}) => {
    const totalMonths = diffInCalendarMonthsInclusive(target.createdAt, target.dueDate) || 1;
    const rawInstallment = Math.ceil(target.totalAmount / totalMonths);
    return Math.max(1, Math.min(target.remainingAmount, rawInstallment));
};

router.get('/', async (_req, res) => {
    try {
        const targets = await prisma.target.findMany({
            include: { owner: true },
            orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
        });

        const activeRemaining = targets
            .filter((target) => target.isActive)
            .reduce((sum, target) => sum + target.remainingAmount, 0);

        res.json({ targets, summary: { activeRemaining } });
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data target' });
    }
});

router.post('/', async (req, res) => {
    const { title, totalAmount, period, ownerId, dueDate, monthCount } = req.body;

    if (!title || !totalAmount) {
        return res.status(400).json({ error: 'Data target tidak lengkap' });
    }

    const parsedAmount = parseFloat(totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Jumlah target harus lebih dari 0' });
    }

    const parsedMonthCount = parseMonthCount(monthCount);
    const parsedPeriod = parsedMonthCount
        ? monthCountToPeriod(parsedMonthCount)
        : (Object.values(TargetPeriod).includes(period as TargetPeriod) ? (period as TargetPeriod) : null);

    if (!parsedPeriod) {
        return res.status(400).json({ error: 'Jumlah bulan target tidak valid' });
    }

    try {
        let selectedOwnerId = ownerId ? String(ownerId) : '';
        if (!selectedOwnerId) {
            const owner = await prisma.owner.findFirst({ orderBy: { createdAt: 'asc' } });
            if (owner) {
                selectedOwnerId = owner.id;
            } else {
                const newOwner = await prisma.owner.create({ data: { name: 'Owner Utama' } });
                selectedOwnerId = newOwner.id;
            }
        }

        const target = await prisma.target.create({
            data: {
                title: String(title),
                totalAmount: parsedAmount,
                remainingAmount: parsedAmount,
                period: parsedPeriod,
                ownerId: selectedOwnerId,
                dueDate: parsedMonthCount
                    ? dueDateFromMonthCount(parsedMonthCount)
                    : (dueDate ? new Date(dueDate) : null)
            }
        });

        res.status(201).json(target);
    } catch (error: any) {
        console.error('Create target error:', error);
        res.status(400).json({
            error: 'Gagal membuat target',
            detail: error?.message || 'unknown error'
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.target.delete({
            where: { id: req.params.id }
        });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: 'Gagal menghapus target' });
    }
});

router.post('/:id/mark-progress', async (req, res) => {
    try {
        const current = await prisma.target.findUnique({ where: { id: req.params.id } });
        if (!current) {
            return res.status(404).json({ error: 'Target tidak ditemukan' });
        }

        if (!current.isActive || current.remainingAmount <= 0) {
            return res.status(400).json({ error: 'Target ini sudah selesai' });
        }

        const appliedAmount = getSuggestedContributionAmount(current);
        const nextRemaining = Math.max(0, current.remainingAmount - appliedAmount);

        const updated = await prisma.target.update({
            where: { id: req.params.id },
            data: {
                remainingAmount: nextRemaining,
                isActive: nextRemaining > 0
            },
            include: { owner: true }
        });

        res.json({ target: updated, appliedAmount });
    } catch (error: any) {
        res.status(400).json({ error: error?.message || 'Gagal menandai setoran target' });
    }
});

router.put('/:id', async (req, res) => {
    const { title, totalAmount, period, dueDate, monthCount } = req.body;

    if (!title || !totalAmount) {
        return res.status(400).json({ error: 'Data target tidak lengkap' });
    }

    const parsedAmount = parseFloat(totalAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Jumlah target harus lebih dari 0' });
    }

    try {
        const current = await prisma.target.findUnique({ where: { id: req.params.id } });
        if (!current) {
            return res.status(404).json({ error: 'Target tidak ditemukan' });
        }

        const completedAmount = Math.max(0, current.totalAmount - current.remainingAmount);
        const nextRemaining = Math.max(0, parsedAmount - completedAmount);
        const parsedMonthCount = parseMonthCount(monthCount);
        const nextPeriod = parsedMonthCount
            ? monthCountToPeriod(parsedMonthCount)
            : (Object.values(TargetPeriod).includes(period as TargetPeriod) ? (period as TargetPeriod) : null);

        if (!nextPeriod) {
            return res.status(400).json({ error: 'Jumlah bulan target tidak valid' });
        }

        const updated = await prisma.target.update({
            where: { id: req.params.id },
            data: {
                title: String(title),
                totalAmount: parsedAmount,
                remainingAmount: nextRemaining,
                isActive: nextRemaining > 0,
                period: nextPeriod,
                dueDate: parsedMonthCount
                    ? dueDateFromMonthCount(parsedMonthCount, current.createdAt)
                    : (dueDate ? new Date(dueDate) : null)
            }
        });

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: 'Gagal mengubah target', detail: error?.message || 'unknown error' });
    }
});

export default router;
