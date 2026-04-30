ALTER TABLE public."Target"
ADD COLUMN IF NOT EXISTS "lastContributionAt" TIMESTAMP(3);
