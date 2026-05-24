DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockTransactionSide') THEN
        CREATE TYPE "StockTransactionSide" AS ENUM ('BUY', 'SELL');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IpoOrderStatus') THEN
        CREATE TYPE "IpoOrderStatus" AS ENUM ('PESAN', 'JATAH', 'TIDAK_JATAH', 'JUAL');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "StockTransaction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" "StockTransactionSide" NOT NULL,
    "lot" INTEGER NOT NULL,
    "pricePerShare" DOUBLE PRECISION NOT NULL,
    "grossValue" DOUBLE PRECISION NOT NULL,
    "brokerFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "levyFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netValue" DOUBLE PRECISION NOT NULL,
    "tradedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IpoOrder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "ipoPrice" DOUBLE PRECISION NOT NULL,
    "lotRequested" INTEGER NOT NULL,
    "lotAllocated" INTEGER NOT NULL DEFAULT 0,
    "sellPrice" DOUBLE PRECISION,
    "status" "IpoOrderStatus" NOT NULL,
    "notes" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "allottedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IpoOrder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IpoOrder"
    ADD COLUMN IF NOT EXISTS "allottedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "IpoTransaction" (
    "id" TEXT NOT NULL,
    "ipoOrderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" "StockTransactionSide" NOT NULL,
    "lot" INTEGER NOT NULL,
    "pricePerShare" DOUBLE PRECISION NOT NULL,
    "grossValue" DOUBLE PRECISION NOT NULL,
    "feePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netValue" DOUBLE PRECISION NOT NULL,
    "tradedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IpoTransaction_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransaction_ownerId_fkey') THEN
        ALTER TABLE "StockTransaction"
            ADD CONSTRAINT "StockTransaction_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransaction_accountId_fkey') THEN
        ALTER TABLE "StockTransaction"
            ADD CONSTRAINT "StockTransaction_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IpoOrder_ownerId_fkey') THEN
        ALTER TABLE "IpoOrder"
            ADD CONSTRAINT "IpoOrder_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IpoOrder_accountId_fkey') THEN
        ALTER TABLE "IpoOrder"
            ADD CONSTRAINT "IpoOrder_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IpoTransaction_ipoOrderId_fkey') THEN
        ALTER TABLE "IpoTransaction"
            ADD CONSTRAINT "IpoTransaction_ipoOrderId_fkey"
            FOREIGN KEY ("ipoOrderId") REFERENCES "IpoOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IpoTransaction_ownerId_fkey') THEN
        ALTER TABLE "IpoTransaction"
            ADD CONSTRAINT "IpoTransaction_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IpoTransaction_accountId_fkey') THEN
        ALTER TABLE "IpoTransaction"
            ADD CONSTRAINT "IpoTransaction_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StockTransaction_ownerId_ticker_tradedAt_idx"
    ON "StockTransaction"("ownerId", "ticker", "tradedAt");

CREATE INDEX IF NOT EXISTS "StockTransaction_accountId_tradedAt_idx"
    ON "StockTransaction"("accountId", "tradedAt");

CREATE INDEX IF NOT EXISTS "IpoOrder_ownerId_status_orderedAt_idx"
    ON "IpoOrder"("ownerId", "status", "orderedAt");

CREATE INDEX IF NOT EXISTS "IpoOrder_accountId_orderedAt_idx"
    ON "IpoOrder"("accountId", "orderedAt");

CREATE INDEX IF NOT EXISTS "IpoTransaction_ownerId_ticker_tradedAt_idx"
    ON "IpoTransaction"("ownerId", "ticker", "tradedAt");

CREATE INDEX IF NOT EXISTS "IpoTransaction_ipoOrderId_side_idx"
    ON "IpoTransaction"("ipoOrderId", "side");
