import dotenv from 'dotenv';
import os from 'os';
import app from './app.js';

dotenv.config();

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

app.listen(Number(PORT), HOST, () => {
    const localAddresses = getLocalIpv4Addresses();
    console.log(`Server beroperasi di http://localhost:${PORT}`);
    for (const address of localAddresses) {
        console.log(`Akses jaringan lokal: http://${address}:${PORT}`);
    }
});
