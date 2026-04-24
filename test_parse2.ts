import { readFileSync } from 'node:fs';

const code = readFileSync('./api/webhook.ts', 'utf-8');
const E_WALLET_APPS = ['dana', 'gopay', 'ovo', 'shopeepay', 'flip'];
const text = 'Rp20.000 telah dikirim ke BASHOR FAUZAN MUTHOH - ****1533 💸';
const sourceApp = 'DANA';

const normalizeText = (value: string) => value.toLowerCase().trim();
const lowerSourceApp = normalizeText(sourceApp);

const isEwalletTransfer = E_WALLET_APPS.some((app) => lowerSourceApp.includes(app))
        && (text.includes('dikirim ke') || text.includes('telah dikirim'));

console.log(isEwalletTransfer);

// Try to execute the function directly. We can compile it to js.
