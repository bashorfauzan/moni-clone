import axios from 'axios';

const resolveApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const isLocalHost = ['localhost', '127.0.0.1'].includes(hostname);
        const isLocalIp = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.');

        if (envUrl) {
            try {
                const parsed = new URL(envUrl, window.location.origin);
                const envHostname = parsed.hostname;
                const envIsLoopback = ['localhost', '127.0.0.1'].includes(envHostname);

                if (!isLocalHost && envIsLoopback) {
                    parsed.hostname = hostname;
                    parsed.protocol = window.location.protocol === 'https:' ? 'https:' : parsed.protocol;
                    return parsed.toString().replace(/\/$/, '');
                }

                return parsed.toString().replace(/\/$/, '');
            } catch {
                if (envUrl.startsWith('/')) {
                    return envUrl;
                }
            }
        }

        if (isLocalIp) {
            return `http://${hostname}:5001/api`;
        }

        if (isLocalHost) {
            return `${window.location.protocol}//${hostname}:5001/api`;
        }

        return '/api';
    }

    return '/api';
};

const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
