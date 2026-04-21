import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import XLSX from 'xlsx';

const DEFAULT_FILE = path.join(process.cwd(), 'Catatan Keuangan Pribadi 2026 Lengkap.xlsx');
const DEFAULT_SHEET = 'Transaksi';
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), 'import-previews');
const DEFAULT_API_BASE_URL = process.env.IMPORT_API_BASE_URL || 'http://localhost:5001/api';

const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeKey = (value) => cleanText(value).toLowerCase();

const normalizePersonName = (value) => cleanText(value);
const normalizeAccountName = (value) => cleanText(value);
const normalizeActivityName = (value) => cleanText(value);

const parseArgs = () => {
    const [, , command = 'preview', ...rest] = process.argv;
    const options = {
        file: DEFAULT_FILE,
        sheet: DEFAULT_SHEET,
        outputDir: DEFAULT_OUTPUT_DIR,
        apiBaseUrl: DEFAULT_API_BASE_URL,
        createActivities: true,
        createOwners: false,
        limit: null
    };

    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        const next = rest[index + 1];

        if (token === '--file' && next) {
            options.file = path.resolve(next);
            index += 1;
        } else if (token === '--sheet' && next) {
            options.sheet = next;
            index += 1;
        } else if (token === '--output-dir' && next) {
            options.outputDir = path.resolve(next);
            index += 1;
        } else if (token === '--api-base-url' && next) {
            options.apiBaseUrl = next.replace(/\/$/, '');
            index += 1;
        } else if (token === '--no-create-activities') {
            options.createActivities = false;
        } else if (token === '--create-owners') {
            options.createOwners = true;
        } else if (token === '--limit' && next) {
            options.limit = Number(next);
            index += 1;
        }
    }

    return { command, options };
};

const excelSerialToIsoDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return '';

        const year = String(parsed.y).padStart(4, '0');
        const month = String(parsed.m).padStart(2, '0');
        const day = String(parsed.d).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const text = cleanText(value);
    if (!text) return '';

    const fallback = new Date(text);
    if (Number.isNaN(fallback.getTime())) return '';
    return fallback.toISOString().slice(0, 10);
};

const normalizeType = (value) => {
    const normalized = normalizeKey(value);
    if (normalized === 'income') return 'INCOME';
    if (normalized === 'expense') return 'EXPENSE';
    if (normalized === 'transfer') return 'TRANSFER';
    return null;
};

const shouldSkipNoiseValue = (value) => {
    const normalized = normalizeKey(value);
    return normalized === '' || normalized === '2026' || normalized === '-';
};

const normalizeAmount = (value) => {
    if (typeof value === 'number') return value;

    const text = cleanText(value)
        .replace(/^rp/i, '')
        .replace(/\./g, '')
        .replace(/,/g, '.')
        .replace(/\s+/g, '');

    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : NaN;
};

const prepareRow = (row, index) => {
    const rowNumber = index + 2;
    const type = normalizeType(row['Jenis Transaksi']);
    const ownerName = normalizePersonName(row['Pemilik']);
    const sourceAccountName = normalizeAccountName(row['Rekening Sumber']);
    const destinationAccountName = normalizeAccountName(row['Rekening Tujuan']);
    const activityName = normalizeActivityName(row['Aktivitas']);
    const description = cleanText(row['Keterangan']);
    const amount = normalizeAmount(row['Jumlah (Rp)']);
    const date = excelSerialToIsoDate(row['Tanggal']);

    return {
        rowNumber,
        raw: row,
        normalized: {
            date,
            type,
            ownerName,
            activityName,
            sourceAccountName: shouldSkipNoiseValue(sourceAccountName) ? '' : sourceAccountName,
            destinationAccountName: shouldSkipNoiseValue(destinationAccountName) ? '' : destinationAccountName,
            amount,
            description,
            isValidated: true
        }
    };
};

const buildTransferPairKey = (item) => (
    [
        item.normalized.date,
        normalizeKey(item.normalized.ownerName),
        item.normalized.amount
    ].join('|')
);

const pairTransferRows = (preparedRows) => {
    const pendingOutgoing = new Map();
    const pendingIncoming = new Map();
    const consumed = new Set();
    const mergedRows = [];

    const pushPending = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    };

    const takePending = (map, key) => {
        const queue = map.get(key) || [];
        const next = queue.shift();
        if (queue.length === 0) map.delete(key);
        else map.set(key, queue);
        return next;
    };

    for (const item of preparedRows) {
        const { type, sourceAccountName, destinationAccountName } = item.normalized;
        const isPartialTransfer = type === 'TRANSFER' && (!sourceAccountName || !destinationAccountName);
        if (!isPartialTransfer) continue;

        const key = buildTransferPairKey(item);
        const hasSourceOnly = Boolean(sourceAccountName) && !destinationAccountName;
        const hasDestinationOnly = !sourceAccountName && Boolean(destinationAccountName);

        if (hasSourceOnly) {
            const counterpart = takePending(pendingIncoming, key);
            if (counterpart) {
                consumed.add(item.rowNumber);
                consumed.add(counterpart.rowNumber);
                mergedRows.push({
                    rowNumber: `${item.rowNumber}+${counterpart.rowNumber}`,
                    raw: [item.raw, counterpart.raw],
                    normalized: {
                        ...item.normalized,
                        activityName: item.normalized.activityName || counterpart.normalized.activityName,
                        description: item.normalized.description || counterpart.normalized.description,
                        destinationAccountName: counterpart.normalized.destinationAccountName
                    }
                });
            } else {
                pushPending(pendingOutgoing, key, item);
            }
        } else if (hasDestinationOnly) {
            const counterpart = takePending(pendingOutgoing, key);
            if (counterpart) {
                consumed.add(item.rowNumber);
                consumed.add(counterpart.rowNumber);
                mergedRows.push({
                    rowNumber: `${counterpart.rowNumber}+${item.rowNumber}`,
                    raw: [counterpart.raw, item.raw],
                    normalized: {
                        ...counterpart.normalized,
                        activityName: counterpart.normalized.activityName || item.normalized.activityName,
                        description: counterpart.normalized.description || item.normalized.description,
                        destinationAccountName: item.normalized.destinationAccountName
                    }
                });
            } else {
                pushPending(pendingIncoming, key, item);
            }
        }
    }

    const remainingRows = preparedRows.filter((item) => !consumed.has(item.rowNumber));
    return [...remainingRows, ...mergedRows].sort((left, right) => {
        const leftValue = Number(String(left.rowNumber).split('+')[0]);
        const rightValue = Number(String(right.rowNumber).split('+')[0]);
        return leftValue - rightValue;
    });
};

const validatePreparedRow = (item) => {
    const reasons = [];
    const { type, ownerName, sourceAccountName, destinationAccountName, amount, date } = item.normalized;

    if (!type) reasons.push(`Jenis transaksi tidak dikenali: "${cleanText(item.raw['Jenis Transaksi'])}"`);
    if (shouldSkipNoiseValue(ownerName)) reasons.push(`Pemilik tidak valid: "${ownerName}"`);
    if (!Number.isFinite(amount) || amount <= 0) reasons.push(`Jumlah tidak valid: "${item.raw['Jumlah (Rp)']}"`);
    if (!date) reasons.push(`Tanggal tidak valid: "${item.raw['Tanggal']}"`);

    if (type === 'INCOME' && shouldSkipNoiseValue(destinationAccountName)) {
        reasons.push(`Rekening tujuan income tidak valid: "${destinationAccountName}"`);
    }

    if (type === 'EXPENSE' && shouldSkipNoiseValue(sourceAccountName)) {
        reasons.push(`Rekening sumber expense tidak valid: "${sourceAccountName}"`);
    }

    if (type === 'TRANSFER') {
        if (shouldSkipNoiseValue(sourceAccountName)) {
            reasons.push(`Rekening sumber transfer tidak valid: "${sourceAccountName}"`);
        }
        if (shouldSkipNoiseValue(destinationAccountName)) {
            reasons.push(`Rekening tujuan transfer tidak valid: "${destinationAccountName}"`);
        }
    }

    return {
        ...item,
        reasons,
        isValid: reasons.length === 0
    };
};

const loadWorkbookRows = async ({ file, sheet }) => {
    const workbook = XLSX.readFile(file);
    const worksheet = workbook.Sheets[sheet];

    if (!worksheet) {
        throw new Error(`Sheet "${sheet}" tidak ditemukan. Sheet tersedia: ${workbook.SheetNames.join(', ')}`);
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    return rows;
};

const buildPreview = (rows, limit = null) => {
    const pairedRows = pairTransferRows(rows.map(prepareRow));
    const prepared = pairedRows.map(validatePreparedRow);
    const validRows = prepared.filter((item) => item.isValid);
    const skippedRows = prepared.filter((item) => !item.isValid);
    const limitedValidRows = typeof limit === 'number' && Number.isFinite(limit)
        ? validRows.slice(0, limit)
        : validRows;

    return {
        summary: {
            sourceRows: rows.length,
            normalizedRows: prepared.length,
            validRows: validRows.length,
            skippedRows: skippedRows.length
        },
        validRows: limitedValidRows,
        skippedRows
    };
};

const ensureDir = async (dir) => {
    await fs.mkdir(dir, { recursive: true });
};

const writePreviewFiles = async (preview, outputDir) => {
    await ensureDir(outputDir);

    const summaryPath = path.join(outputDir, 'transactions-cleaning-summary.json');
    const validPath = path.join(outputDir, 'transactions-valid-preview.json');
    const skippedPath = path.join(outputDir, 'transactions-skipped-preview.json');

    await Promise.all([
        fs.writeFile(summaryPath, JSON.stringify(preview.summary, null, 2)),
        fs.writeFile(validPath, JSON.stringify(preview.validRows, null, 2)),
        fs.writeFile(skippedPath, JSON.stringify(preview.skippedRows, null, 2))
    ]);

    return { summaryPath, validPath, skippedPath };
};

const fetchJson = async (url, init) => {
    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const detail = typeof body === 'string'
            ? body
            : body?.error || body?.message || JSON.stringify(body);
        throw new Error(`${response.status} ${response.statusText}: ${detail}`);
    }

    return body;
};

const buildMetaMaps = (meta) => {
    const ownerMap = new Map(meta.owners.map((owner) => [normalizeKey(owner.name), owner]));
    const accountMap = new Map(meta.accounts.map((account) => [normalizeKey(account.name), account]));
    const activityMap = new Map(meta.activities.map((activity) => [normalizeKey(activity.name), activity]));
    return { ownerMap, accountMap, activityMap };
};

const ensureActivity = async (activityName, maps, apiBaseUrl, createActivities) => {
    const normalized = normalizeKey(activityName);
    if (!normalized) return null;

    const existing = maps.activityMap.get(normalized);
    if (existing) return existing;
    if (!createActivities) return null;

    const created = await fetchJson(`${apiBaseUrl}/master/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: activityName })
    });
    maps.activityMap.set(normalized, created);
    return created;
};

const ensureOwner = async (ownerName, maps, apiBaseUrl, createOwners) => {
    const normalized = normalizeKey(ownerName);
    const existing = maps.ownerMap.get(normalized);
    if (existing) return existing;
    if (!createOwners) return null;

    const created = await fetchJson(`${apiBaseUrl}/master/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ownerName })
    });
    maps.ownerMap.set(normalized, created);
    return created;
};

const importRowsViaApi = async (preview, options) => {
    const meta = await fetchJson(`${options.apiBaseUrl}/master/meta`);
    const maps = buildMetaMaps(meta);
    const imported = [];
    const failed = [];

    const rowsToImport = typeof options.limit === 'number' && Number.isFinite(options.limit)
        ? preview.validRows.slice(0, options.limit)
        : preview.validRows;

    for (const row of rowsToImport) {
        try {
            const owner = await ensureOwner(row.normalized.ownerName, maps, options.apiBaseUrl, options.createOwners);
            if (!owner) {
                throw new Error(`Owner tidak ditemukan: ${row.normalized.ownerName}`);
            }

            const sourceAccount = row.normalized.sourceAccountName
                ? maps.accountMap.get(normalizeKey(row.normalized.sourceAccountName))
                : null;
            const destinationAccount = row.normalized.destinationAccountName
                ? maps.accountMap.get(normalizeKey(row.normalized.destinationAccountName))
                : null;

            if (row.normalized.type === 'EXPENSE' || row.normalized.type === 'TRANSFER') {
                if (!sourceAccount) {
                    throw new Error(`Rekening sumber tidak ditemukan: ${row.normalized.sourceAccountName}`);
                }
            }

            if (row.normalized.type === 'INCOME' || row.normalized.type === 'TRANSFER') {
                if (!destinationAccount) {
                    throw new Error(`Rekening tujuan tidak ditemukan: ${row.normalized.destinationAccountName}`);
                }
            }

            const activity = await ensureActivity(
                row.normalized.activityName,
                maps,
                options.apiBaseUrl,
                options.createActivities
            );

            const payload = {
                type: row.normalized.type,
                amount: row.normalized.amount,
                ownerId: owner.id,
                activityId: activity?.id,
                description: row.normalized.description || undefined,
                date: row.normalized.date,
                sourceAccountId: sourceAccount?.id,
                destinationAccountId: destinationAccount?.id
            };

            const response = await fetchJson(`${options.apiBaseUrl}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            imported.push({
                rowNumber: row.rowNumber,
                id: response.id,
                description: row.normalized.description,
                amount: row.normalized.amount
            });
        } catch (error) {
            failed.push({
                rowNumber: row.rowNumber,
                error: error instanceof Error ? error.message : String(error),
                normalized: row.normalized
            });
        }
    }

    return {
        summary: {
            attempted: rowsToImport.length,
            imported: imported.length,
            failed: failed.length
        },
        imported,
        failed
    };
};

const main = async () => {
    const { command, options } = parseArgs();
    const rows = await loadWorkbookRows(options);
    const preview = buildPreview(rows, options.limit);

    if (command === 'preview') {
        const files = await writePreviewFiles(preview, options.outputDir);
        console.log(JSON.stringify({
            ...preview.summary,
            output: files
        }, null, 2));
        return;
    }

    if (command === 'import-api') {
        const result = await importRowsViaApi(preview, options);
        await ensureDir(options.outputDir);
        const resultPath = path.join(options.outputDir, 'transactions-import-result.json');
        await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ ...result.summary, output: resultPath }, null, 2));
        return;
    }

    throw new Error(`Command tidak dikenal: ${command}`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
