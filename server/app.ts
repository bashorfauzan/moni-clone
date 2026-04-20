import express from 'express';
import cors from 'cors';

import transactionRoutes from './routes/transaction.js';
import budgetRoutes from './routes/budget.js';
import masterRoutes from './routes/master.js';
import targetRoutes from './routes/target.js';
import webhookRoutes from './routes/webhook.js';
import telegramRoutes from './routes/telegram.js';
import authRoutes from './routes/auth.js';

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

console.log('[Server] Mounting routes...');
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/targets', targetRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/auth', authRoutes);
console.log('[Server] Routes mounted successfully');

app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
});

app.get('/', (_req, res) => {
    res.send('API Aplikasi Keuangan Pribadi berjalan lancar!');
});

export default app;
