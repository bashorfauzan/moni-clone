import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';

import transactionRoutes from './routes/transaction.js';
import budgetRoutes from './routes/budget.js';
import masterRoutes from './routes/master.js';
import targetRoutes from './routes/target.js';
import webhookRoutes from './routes/webhook.js';
import telegramRoutes from './routes/telegram.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

const getLocalIpv4Addresses = () => {
    const interfaces = os.networkInterfaces();
    return Object.values(interfaces)
        .flat()
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.family === 'IPv4' && !item.internal)
        .map((item) => item.address);
};

app.use(cors({
    origin: '*', // Untuk pengembangan, izinkan semua (Bahasa Indonesia)
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
console.log('[Server] Routes mounted successfully');

app.get('/', (_req, res) => {
    res.send('API Aplikasi Keuangan Pribadi (v2 - 2026-03-24 07:05) berjalan lancar!');
});

app.listen(Number(PORT), HOST, () => {
    const localAddresses = getLocalIpv4Addresses();
    console.log(`Server beroperasi di http://localhost:${PORT}`);
    for (const address of localAddresses) {
        console.log(`Akses jaringan lokal: http://${address}:${PORT}`);
    }
});
