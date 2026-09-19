-- FRELUX Price Scan History
-- Tracks automatic price scans for audit trail and trend analysis

CREATE TABLE IF NOT EXISTS public.price_scan_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    material_key TEXT NOT NULL,
    material_name TEXT NOT NULL,
    old_price NUMERIC NOT NULL,
    new_price NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    change_percent NUMERIC NOT NULL,
    source TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    market_region TEXT NOT NULL DEFAULT 'Nigeria',
    currency TEXT NOT NULL DEFAULT 'NGN',
    success BOOLEAN NOT NULL DEFAULT true,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying by material and date
CREATE INDEX IF NOT EXISTS idx_price_scan_material_date 
    ON public.price_scan_history (material_key, scan_date DESC);

-- Index for querying recent scans
CREATE INDEX IF NOT EXISTS idx_price_scan_date 
    ON public.price_scan_history (scan_date DESC);

-- RLS: only admin can view/insert
ALTER TABLE public.price_scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view price scan history" ON public.price_scan_history;
CREATE POLICY "Admins can view price scan history" 
    ON public.price_scan_history FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can insert price scan history" ON public.price_scan_history;
CREATE POLICY "Admins can insert price scan history" 
    ON public.price_scan_history FOR INSERT 
    TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Add price_source and price_date columns to existing estimation prices if not exist
-- (for tracking when prices were last updated and from what source)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'estimation_prices' AND column_name = 'last_scanned_at'
    ) THEN
        ALTER TABLE public.estimation_prices 
            ADD COLUMN last_scanned_at TIMESTAMPTZ,
            ADD COLUMN scan_confidence TEXT DEFAULT 'manual' CHECK (scan_confidence IN ('manual', 'low', 'medium', 'high')),
            ADD COLUMN scan_source TEXT;
    END IF;
END $$;

-- Comment
COMMENT ON TABLE public.price_scan_history IS 'FRELUX automatic price scanner history — tracks all price scans for audit and trend analysis';
