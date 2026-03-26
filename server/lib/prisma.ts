import { PrismaClient } from '@prisma/client';

const normalizeDatasourceUrl = (rawUrl?: string) => {
    if (!rawUrl) return undefined;

    const trimmed = rawUrl.trim();
    if (!trimmed) return undefined;

    try {
        const url = new URL(trimmed);
        const isSupabasePooler = url.hostname.includes('pooler.supabase.com') || url.port === '6543';

        if (isSupabasePooler && url.searchParams.get('pgbouncer') !== 'true') {
            url.searchParams.set('pgbouncer', 'true');
        }

        return url.toString();
    } catch {
        return trimmed;
    }
};

const createPrismaClient = () => {
    const datasourceUrl = normalizeDatasourceUrl(process.env.DATABASE_URL);

    return new PrismaClient(
        datasourceUrl
            ? {
                datasources: {
                    db: {
                        url: datasourceUrl
                    }
                }
            }
            : undefined
    );
};

const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
