const flattenObjectError = (value: unknown): string | null => {
    if (!value) return null;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (Array.isArray(value)) {
        const parts = value
            .map((item) => flattenObjectError(item))
            .filter((item): item is string => Boolean(item));

        return parts.length > 0 ? parts.join(', ') : null;
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const preferredKeys = ['error', 'message', 'detail', 'details', 'reason', 'hint'];

        for (const key of preferredKeys) {
            const nested = flattenObjectError(record[key]);
            if (nested) return nested;
        }

        const values = Object.values(record)
            .map((item) => flattenObjectError(item))
            .filter((item): item is string => Boolean(item));

        return values.length > 0 ? values.join(', ') : null;
    }

    return null;
};

export const getErrorMessage = (error: unknown, fallback: string) => {
    if (!error) return fallback;

    const candidate = error as {
        message?: unknown;
        response?: {
            data?: unknown;
        };
    };

    const fromResponseData = flattenObjectError(candidate.response?.data);
    if (fromResponseData) return fromResponseData;

    const fromMessage = flattenObjectError(candidate.message);
    if (fromMessage) return fromMessage;

    return fallback;
};
