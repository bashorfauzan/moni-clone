DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TargetKind') THEN
        CREATE TYPE "TargetKind" AS ENUM ('SAVING', 'BILL');
    END IF;
END $$;

ALTER TABLE "Target"
ADD COLUMN IF NOT EXISTS "kind" "TargetKind" NOT NULL DEFAULT 'SAVING';
