import axios from 'axios';

const resolveApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) return envUrl;

    if (typeof window !== 'undefined') {
        const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        return isLocalHost
            ? `${window.location.protocol}//${window.location.hostname}:5001/api`
            : '/api';
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
