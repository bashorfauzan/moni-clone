import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Ambil semua anggaran
router.get('/', async (req, res) => {
    try {
        const budgets = await prisma.budget.findMany({
            include: {
                owner: true
            }
        });
        res.json(budgets);
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data anggaran' });
    }
});

// Buat anggaran baru
router.post('/', async (req, res) => {
    const { amount, period, ownerId } = req.body;
    try {
        const budget = await prisma.budget.create({
            data: {
                amount: parseFloat(amount),
                period,
                ownerId
            }
        });
        res.status(201).json(budget);
    } catch (error) {
        res.status(400).json({ error: 'Gagal membuat anggaran' });
    }
});

export default router;
