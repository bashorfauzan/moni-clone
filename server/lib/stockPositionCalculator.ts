import { StockTransactionSide, type StockTransaction } from '@prisma/client';

type PositionLot = {
    remainingShares: number;
    pricePerShare: number;
    costPerShare: number;
};

export type StockPositionSummary = {
    ticker: string;
    totalLots: number;
    totalShares: number;
    avgBuyPrice: number;
    avgCostPerShare: number;
    totalCost: number;
    marketValue: number;
    realizedPnl: number;
    buyCount: number;
    sellCount: number;
    lastTradedAt: string;
};

const SHARES_PER_LOT = 100;

const round2 = (value: number) => Number(value.toFixed(2));

export const calculateStockPositions = (
    transactions: Pick<
        StockTransaction,
        'ticker' | 'side' | 'lot' | 'pricePerShare' | 'grossValue' | 'netValue' | 'tradedAt'
    >[]
): StockPositionSummary[] => {
    const grouped = new Map<string, typeof transactions>();

    for (const transaction of transactions) {
        const ticker = String(transaction.ticker || '').trim().toUpperCase();
        if (!ticker) continue;
        const current = grouped.get(ticker) || [];
        current.push({
            ...transaction,
            ticker
        });
        grouped.set(ticker, current);
    }

    const positions: StockPositionSummary[] = [];

    for (const [ticker, rows] of grouped.entries()) {
        const sortedRows = [...rows].sort((a, b) => {
            const timeDiff = new Date(a.tradedAt).getTime() - new Date(b.tradedAt).getTime();
            if (timeDiff !== 0) return timeDiff;
            return a.side.localeCompare(b.side);
        });

        const fifoLots: PositionLot[] = [];
        let realizedPnl = 0;
        let buyCount = 0;
        let sellCount = 0;
        let lastTradedAt = sortedRows[0]?.tradedAt ?? new Date(0);

        for (const row of sortedRows) {
            const shares = Number(row.lot || 0) * SHARES_PER_LOT;
            if (!Number.isFinite(shares) || shares <= 0) continue;

            const grossValue = Number(row.grossValue || row.pricePerShare * shares);
            const netValue = Number(row.netValue || grossValue);

            if (new Date(row.tradedAt).getTime() > new Date(lastTradedAt).getTime()) {
                lastTradedAt = row.tradedAt;
            }

            if (row.side === StockTransactionSide.BUY) {
                buyCount += 1;
                fifoLots.push({
                    remainingShares: shares,
                    pricePerShare: Number(row.pricePerShare || 0),
                    costPerShare: shares > 0 ? netValue / shares : 0
                });
                continue;
            }

            sellCount += 1;
            let sharesToSell = shares;
            const proceedsPerShare = shares > 0 ? netValue / shares : 0;

            while (sharesToSell > 0 && fifoLots.length > 0) {
                const lot = fifoLots[0];
                if (!lot) break;
                const matchedShares = Math.min(lot.remainingShares, sharesToSell);
                realizedPnl += (proceedsPerShare - lot.costPerShare) * matchedShares;
                lot.remainingShares -= matchedShares;
                sharesToSell -= matchedShares;

                if (lot.remainingShares <= 0) {
                    fifoLots.shift();
                }
            }
        }

        const totalShares = fifoLots.reduce((sum, lot) => sum + lot.remainingShares, 0);
        const totalCost = fifoLots.reduce((sum, lot) => sum + (lot.remainingShares * lot.costPerShare), 0);
        const totalPriceCost = fifoLots.reduce((sum, lot) => sum + (lot.remainingShares * lot.pricePerShare), 0);
        const avgBuyPrice = totalShares > 0 ? totalPriceCost / totalShares : 0;
        const avgCostPerShare = totalShares > 0 ? totalCost / totalShares : 0;

        if (totalShares > 0 || realizedPnl !== 0) {
            positions.push({
                ticker,
                totalLots: totalShares / SHARES_PER_LOT,
                totalShares,
                avgBuyPrice: round2(avgBuyPrice),
                avgCostPerShare: round2(avgCostPerShare),
                totalCost: round2(totalCost),
                marketValue: round2(totalCost),
                realizedPnl: round2(realizedPnl),
                buyCount,
                sellCount,
                lastTradedAt: new Date(lastTradedAt).toISOString()
            });
        }
    }

    return positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
};
