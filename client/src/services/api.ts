import axios from 'axios';

const resolveApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;

    // Jika diakses dari client (browser)
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
        const isLocalIp = hostname.startsWith('192.168.') || hostname.startsWith('10.');

        // 1. Jika diakses dari domain production (misal HP via internet), abaikan VITE_API_BASE_URL (karena isinya 'localhost')
        if (!isLocalHost && !isLocalIp) {
            return 'https://moni-clone-production.up.railway.app/api';
        }

        // 2. Jika diakses via IP Lokal (seperti testing dari HP 192.168.x.x), arahkan API ke IP Lokal tersebut
        if (isLocalIp) {
            return `http://${hostname}:5001/api`;
        }
        
        // 3. Jika di localhost murni
        if (isLocalHost && envUrl && envUrl.includes('localhost')) {
            return envUrl;
        }
        
        if (isLocalHost) {
            return `${window.location.protocol}//${hostname}:5001/api`;
        }
    }

    // Default fallback (SSR atau environment lain)
    return envUrl || 'https://moni-clone-production.up.railway.app/api';
};

const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
