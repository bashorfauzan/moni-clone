import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MIGRATION_DIR = path.resolve(process.cwd(), 'prisma', 'manual-migrations');
const MIGRATION_TABLE = '_ManualMigration';

const checksum = (content: string) =>
    crypto.createHash('sha256').update(content).digest('hex');

const buildClientConfig = (connectionString: string) => {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, '') || 'postgres';

    return {
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database,
        ssl: { rejectUnauthorized: false }
    };
};

const isSafeAlreadyAppliedError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String(error.code || '') : '';
    return ['42710', '42P07', '42701'].includes(code);
};

const ensureMigrationTable = async (client: Client) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
            "id" TEXT PRIMARY KEY,
            "checksum" TEXT NOT NULL,
            "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
};

const getAppliedMigrations = async (client: Client) => {
    const result = await client.query<{ id: string; checksum: string }>(
        `SELECT "id", "checksum" FROM "${MIGRATION_TABLE}"`
    );

    return new Map(result.rows.map((row: { id: string; checksum: string }) => [row.id, row.checksum]));
};

const run = async () => {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        console.log('[manual-migrations] DATABASE_URL tidak tersedia. Skip manual migrations.');
        return;
    }

    const client = new Client(buildClientConfig(connectionString));

    await client.connect();

    try {
        await ensureMigrationTable(client);
        const applied = await getAppliedMigrations(client);
        const entries = (await fs.readdir(MIGRATION_DIR))
            .filter((name) => name.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b));

        for (const fileName of entries) {
            const filePath = path.join(MIGRATION_DIR, fileName);
            const sql = await fs.readFile(filePath, 'utf8');
            const hash = checksum(sql);
            const existingChecksum = applied.get(fileName);

            if (existingChecksum === hash) {
                console.log(`[manual-migrations] skip ${fileName}`);
                continue;
            }

            if (existingChecksum && existingChecksum !== hash) {
                throw new Error(`Checksum migration berubah untuk ${fileName}. Buat file migration baru, jangan ubah yang lama.`);
            }

            console.log(`[manual-migrations] apply ${fileName}`);
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                if (isSafeAlreadyAppliedError(error)) {
                    console.log(`[manual-migrations] mark-existing ${fileName}`);
                } else {
                    throw error;
                }
            }

            await client.query(
                `INSERT INTO "${MIGRATION_TABLE}" ("id", "checksum") VALUES ($1, $2)`,
                [fileName, hash]
            );
        }
    } finally {
        await client.end();
    }
};

run().catch((error) => {
    console.error('[manual-migrations] gagal:', error);
    process.exit(1);
});
