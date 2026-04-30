ALTER TABLE public."Target"
ADD COLUMN IF NOT EXISTS "remainingMonths" INTEGER;

UPDATE public."Target"
SET "remainingMonths" = GREATEST(
    1,
    COALESCE(
        (
            (
                (DATE_PART('year', COALESCE("dueDate", "createdAt")) - DATE_PART('year', "createdAt")) * 12
            ) +
            (
                DATE_PART('month', COALESCE("dueDate", "createdAt")) - DATE_PART('month', "createdAt")
            ) + 1
        )::INTEGER,
        1
    )
)
WHERE "remainingMonths" IS NULL;

UPDATE public."Target"
SET
    "remainingAmount" = "totalAmount" * "remainingMonths",
    "isActive" = "remainingMonths" > 0;

ALTER TABLE public."Target"
ALTER COLUMN "remainingMonths" SET NOT NULL;
