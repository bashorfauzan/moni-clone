import assert from 'node:assert/strict';
import { TransactionType } from '@prisma/client';
import {
    normalizeTransactionType as normalizeServerType,
    isDualAccountTransactionType,
    isLegacyInvestmentTransactionType
} from '../lib/transactionRules.ts';
import { parseNotificationText } from '../routes/webhook.ts';
import {
    inferNotificationCategoryLabel,
    isInvestmentTransfer,
    normalizeTransactionType as normalizeClientType,
    shouldHideLegacyInvestmentTransactionType
} from '../../client/src/lib/transactionRules.ts';

const runCase = (name, fn) => {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
};

runCase('server normalizes TOP_UP into TRANSFER for active logic', () => {
    assert.equal(normalizeServerType(TransactionType.TOP_UP), TransactionType.TRANSFER);
    assert.equal(isDualAccountTransactionType(TransactionType.TOP_UP), true);
});

runCase('legacy investment transaction types stay marked as legacy', () => {
    assert.equal(isLegacyInvestmentTransactionType(TransactionType.INVESTMENT_IN), true);
    assert.equal(isLegacyInvestmentTransactionType(TransactionType.INVESTMENT_OUT), true);
    assert.equal(shouldHideLegacyInvestmentTransactionType('INVESTMENT_IN'), true);
    assert.equal(shouldHideLegacyInvestmentTransactionType('INVESTMENT_OUT'), true);
});

runCase('client detects transfer to RDN as investment transfer', () => {
    assert.equal(
        isInvestmentTransfer({
            type: 'TRANSFER',
            destinationAccount: { type: 'RDN' }
        }),
        true
    );

    assert.equal(
        isInvestmentTransfer({
            type: 'TRANSFER',
            destinationAccount: { type: 'Bank' }
        }),
        false
    );
});

runCase('client normalizes TOP_UP and infers helpful notification labels', () => {
    assert.equal(normalizeClientType('TOP_UP'), 'TRANSFER');
    assert.equal(
        inferNotificationCategoryLabel({
            title: 'Top Up berhasil',
            messageText: 'Pengisian Saldo sebesar Rp11.000 berhasil',
            sourceApp: 'Flip',
            parsedType: 'TOP_UP'
        }),
        'Top Up'
    );

    assert.equal(
        inferNotificationCategoryLabel({
            messageText: 'Transfer gaji bulan April telah masuk',
            parsedType: 'INCOME'
        }),
        'Gaji'
    );
});

runCase('parser keeps Flip top up as transfer with destination hint on Flip', () => {
    const parsed = parseNotificationText(
        'Flip',
        'Flip',
        'Pengisian Saldo 260502192126663KAI01TUP sejumlah Rp200.000 berhasil'
    );

    assert.equal(parsed.amount, 200000);
    assert.equal(parsed.type, TransactionType.TRANSFER);
    assert.equal(parsed.parseStatus, 'PARSED');
    assert.equal(parsed.destinationAccountHint, 'flip');
});

runCase('parser reads BRImo transfer out as transfer with BRI source hint', () => {
    const parsed = parseNotificationText(
        'BRI',
        'BRImo',
        '02/05/2026 19:21:58 - Transfer dari XXXXXX1533 dengan nomor rekening tujuan XXXXXXXXXXXX2303 sebesar Rp200.549,00 BERHASIL.'
    );

    assert.equal(parsed.amount, 200549);
    assert.equal(parsed.type, TransactionType.TRANSFER);
    assert.equal(parsed.parseStatus, 'PARSED');
    assert.equal(parsed.sourceAccountHint, 'bri');
    assert.ok(parsed.destinationAccountHint);
});

console.log('All transaction rule checks passed.');
