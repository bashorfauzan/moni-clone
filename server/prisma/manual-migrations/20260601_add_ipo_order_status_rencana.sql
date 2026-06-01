DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IpoOrderStatus') THEN
        BEGIN
            ALTER TYPE "IpoOrderStatus" ADD VALUE IF NOT EXISTS 'RENCANA';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
