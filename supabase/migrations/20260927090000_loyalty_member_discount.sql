-- Member benefit (5% default) + optional demographics with consent.
-- Registration stays minimal: full_name + phone required, email optional.

-- 1. Member discount percent on the global rule
ALTER TABLE public.loyalty_rules
  ADD COLUMN IF NOT EXISTS member_discount_percent NUMERIC NOT NULL DEFAULT 5;

UPDATE public.loyalty_rules
SET member_discount_percent = 5
WHERE is_active AND (member_discount_percent IS NULL OR member_discount_percent = 0);

-- 2. Track member-discount portion separately on sales (discount stays = total)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS member_discount NUMERIC NOT NULL DEFAULT 0;

-- 3. Optional demographics / segmentation (all nullable, consent-gated)
ALTER TABLE public.loyalty_customers
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_loyalty_customers_area ON public.loyalty_customers(area);
CREATE INDEX IF NOT EXISTS idx_loyalty_customers_age_range ON public.loyalty_customers(age_range);
