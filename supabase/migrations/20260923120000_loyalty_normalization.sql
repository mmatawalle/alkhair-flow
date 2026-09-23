-- Loyalty + multi-branch normalization (V1 foundation)
-- Canonical normalized tables live alongside legacy columns/tables during transition.
-- Legacy to stop writing after frontend cutover:
--   products.shop_stock / online_shop_stock / production_stock -> product_stock_levels
--   sale_records (per-line, no header) -> sales + sale_items
--   transfer_records destination-in-note -> from_branch_id/to_branch_id
--   stock_adjustments.location / gift_records.source_location -> branch_id
-- Backfills below preserve existing data. Nothing is dropped in this migration.

-- ============================================
-- 0. ROLES: cashier / branch_manager / admin
-- ============================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'branch_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

-- ============================================
-- 1. BRANCHES
-- ============================================
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'retail',
  is_active BOOLEAN NOT NULL DEFAULT true,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.branches;
CREATE POLICY "Authenticated users full access" ON public.branches FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_branches_updated_at ON public.branches;
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.branches (code, name, type) VALUES
  ('PROD', 'Production / Central Store', 'production'),
  ('SHOP', 'Shop', 'retail'),
  ('ONLINE', 'Online Shop', 'online')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 2. CATEGORIES (normalize products.category text)
-- ============================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.categories;
CREATE POLICY "Authenticated users full access" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill categories from existing product category text
INSERT INTO public.categories (name)
SELECT DISTINCT category FROM public.products WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
-- Backfill FK (keep legacy products.category text for rollback)
UPDATE public.products p SET category_id = c.id FROM public.categories c WHERE p.category_id IS NULL AND c.name = p.category;

-- ============================================
-- 3. PRODUCT STOCK LEVELS (per branch; replaces *_stock columns)
-- ============================================
CREATE TABLE IF NOT EXISTS public.product_stock_levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id)
);

ALTER TABLE public.product_stock_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.product_stock_levels;
CREATE POLICY "Authenticated users full access" ON public.product_stock_levels FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_product_stock_levels_updated_at ON public.product_stock_levels;
CREATE TRIGGER update_product_stock_levels_updated_at BEFORE UPDATE ON public.product_stock_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON public.product_stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_branch ON public.product_stock_levels(branch_id);

-- Backfill from legacy columns (idempotent via ON CONFLICT)
INSERT INTO public.product_stock_levels (product_id, branch_id, quantity)
SELECT p.id, (SELECT id FROM public.branches WHERE code = 'PROD'), COALESCE(p.production_stock, 0)
FROM public.products p
ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO public.product_stock_levels (product_id, branch_id, quantity)
SELECT p.id, (SELECT id FROM public.branches WHERE code = 'SHOP'), COALESCE(p.shop_stock, 0)
FROM public.products p
ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

INSERT INTO public.product_stock_levels (product_id, branch_id, quantity)
SELECT p.id, (SELECT id FROM public.branches WHERE code = 'ONLINE'), COALESCE(p.online_shop_stock, 0)
FROM public.products p
ON CONFLICT (product_id, branch_id) DO UPDATE SET quantity = EXCLUDED.quantity;

-- ============================================
-- 4. LOYALTY CUSTOMERS + IDENTIFIERS (needed before sales.customer_id)
-- ============================================
CREATE TABLE IF NOT EXISTS public.loyalty_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  birthday DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  tier TEXT NOT NULL DEFAULT 'member',
  branch_created_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_customers;
CREATE POLICY "Authenticated users full access" ON public.loyalty_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_loyalty_customers_updated_at ON public.loyalty_customers;
CREATE TRIGGER update_loyalty_customers_updated_at BEFORE UPDATE ON public.loyalty_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_loyalty_customers_phone ON public.loyalty_customers(phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_customers_status ON public.loyalty_customers(status);

CREATE TABLE IF NOT EXISTS public.loyalty_identifiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.loyalty_customers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'qr_card',
  status TEXT NOT NULL DEFAULT 'active',
  printed_batch TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_identifiers;
CREATE POLICY "Authenticated users full access" ON public.loyalty_identifiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_loyalty_identifiers_updated_at ON public.loyalty_identifiers;
CREATE TRIGGER update_loyalty_identifiers_updated_at BEFORE UPDATE ON public.loyalty_identifiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_loyalty_identifiers_token ON public.loyalty_identifiers(token);
CREATE INDEX IF NOT EXISTS idx_loyalty_identifiers_customer ON public.loyalty_identifiers(customer_id);

-- ============================================
-- 5. SALES HEADER + ITEMS (normalized; replaces sale_records)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_number TEXT NOT NULL UNIQUE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.loyalty_customers(id) ON DELETE SET NULL,
  cashier_id UUID,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sale_type TEXT NOT NULL DEFAULT 'cash',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.sales;
CREATE POLICY "Authenticated users full access" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_sales_updated_at ON public.sales;
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON public.sales(branch_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON public.sales(cashier_id);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  line_cogs NUMERIC NOT NULL DEFAULT 0,
  line_profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.sale_items;
CREATE POLICY "Authenticated users full access" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items(product_id);

-- Backfill: one header per legacy sale_records row (legacy rows are ungrouped lines)
INSERT INTO public.sales (id, sale_number, branch_id, sale_date, sale_type, subtotal, discount, total, status, note, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'S-LEGACY-' || substr(sr.id::text, 1, 8),
  (SELECT id FROM public.branches WHERE code = CASE WHEN sr.sale_source = 'online_shop' THEN 'ONLINE' ELSE 'SHOP' END),
  sr.sale_date, sr.sale_type, sr.total_revenue, 0, sr.total_revenue,
  CASE WHEN sr.voided THEN 'voided' ELSE 'completed' END,
  sr.note, sr.created_at, sr.updated_at
FROM public.sale_records sr
WHERE NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.sale_number = 'S-LEGACY-' || substr(sr.id::text, 1, 8))
;

-- Backfill items linked to the headers above
INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, line_total, unit_cost, line_cogs, line_profit)
SELECT
  s.id, sr.product_id, sr.quantity_sold, sr.selling_price_per_unit, sr.total_revenue,
  sr.cost_per_unit, sr.total_cogs, sr.profit
FROM public.sale_records sr
JOIN public.sales s ON s.sale_number = 'S-LEGACY-' || substr(sr.id::text, 1, 8)
WHERE NOT EXISTS (SELECT 1 FROM public.sale_items si WHERE si.sale_id = s.id AND si.product_id = sr.product_id AND si.quantity = sr.quantity_sold)
;

-- ============================================
-- 6. NORMALIZE TRANSFER / ADJUSTMENT / GIFT / INTERNAL BRANCH LINKS
-- ============================================
ALTER TABLE public.transfer_records ADD COLUMN IF NOT EXISTS from_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.transfer_records ADD COLUMN IF NOT EXISTS to_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

UPDATE public.transfer_records
SET from_branch_id = (SELECT id FROM public.branches WHERE code = 'PROD')
WHERE from_branch_id IS NULL;

UPDATE public.transfer_records
SET to_branch_id = (SELECT id FROM public.branches WHERE code = 'ONLINE')
WHERE to_branch_id IS NULL AND note ILIKE '%online%';

UPDATE public.transfer_records
SET to_branch_id = (SELECT id FROM public.branches WHERE code = 'SHOP')
WHERE to_branch_id IS NULL;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
UPDATE public.stock_adjustments
SET branch_id = (SELECT id FROM public.branches WHERE code = CASE WHEN location = 'online_shop' THEN 'ONLINE' WHEN location = 'production' THEN 'PROD' ELSE 'SHOP' END)
WHERE branch_id IS NULL;

ALTER TABLE public.gift_records ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
UPDATE public.gift_records
SET branch_id = (SELECT id FROM public.branches WHERE code = CASE WHEN source_location = 'production' THEN 'PROD' ELSE 'SHOP' END)
WHERE branch_id IS NULL;

ALTER TABLE public.internal_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Home branch for staff
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- ============================================
-- 7. LOYALTY RULES / EXCLUSIONS / LEDGER / REWARDS
-- ============================================
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  amount_per_point NUMERIC NOT NULL DEFAULT 100,
  min_spend NUMERIC NOT NULL DEFAULT 0,
  point_expiry_days INTEGER NOT NULL DEFAULT 365,
  redemption_value_per_point NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_rules;
CREATE POLICY "Authenticated users full access" ON public.loyalty_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.loyalty_rules (scope, amount_per_point, min_spend, point_expiry_days, redemption_value_per_point, is_active)
SELECT 'global', 100, 0, 365, 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.loyalty_rules WHERE scope = 'global' AND is_active);

CREATE TABLE IF NOT EXISTS public.loyalty_product_exclusions (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_product_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_product_exclusions;
CREATE POLICY "Authenticated users full access" ON public.loyalty_product_exclusions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.loyalty_category_exclusions (
  category TEXT NOT NULL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_category_exclusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_category_exclusions;
CREATE POLICY "Authenticated users full access" ON public.loyalty_category_exclusions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.loyalty_customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  sale_record_id UUID,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'earn',
  reason TEXT,
  cashier_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_points_ledger;
CREATE POLICY "Authenticated users full access" ON public.loyalty_points_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON public.loyalty_points_ledger(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_sale ON public.loyalty_points_ledger(sale_id);
CREATE INDEX IF NOT EXISTS idx_ledger_branch ON public.loyalty_points_ledger(branch_id);

CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'discount',
  value_amount NUMERIC,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_rewards;
CREATE POLICY "Authenticated users full access" ON public.loyalty_rewards FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_loyalty_rewards_updated_at ON public.loyalty_rewards;
CREATE TRIGGER update_loyalty_rewards_updated_at BEFORE UPDATE ON public.loyalty_rewards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.loyalty_customers(id) ON DELETE CASCADE,
  reward_id UUID REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL,
  points_spent INTEGER NOT NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cashier_id UUID,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_redemptions;
CREATE POLICY "Authenticated users full access" ON public.loyalty_redemptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON public.loyalty_redemptions(customer_id, created_at DESC);

-- Reserved stubs for later activation (tiers + campaigns)
CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  min_spend NUMERIC NOT NULL DEFAULT 0,
  min_points INTEGER NOT NULL DEFAULT 0,
  min_visits INTEGER NOT NULL DEFAULT 0,
  benefits JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_tiers;
CREATE POLICY "Authenticated users full access" ON public.loyalty_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.loyalty_tiers (name, is_active) VALUES
  ('Member', false), ('Silver', false), ('Gold', false), ('VIP', false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.loyalty_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at TIMESTAMP WITH TIME ZONE,
  conditions JSONB NOT NULL DEFAULT '{}',
  multiplier NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.loyalty_campaigns;
CREATE POLICY "Authenticated users full access" ON public.loyalty_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Balance view: single source of truth for available points
CREATE OR REPLACE VIEW public.loyalty_customer_balances AS
SELECT customer_id, COALESCE(SUM(points), 0)::bigint AS balance
FROM public.loyalty_points_ledger
GROUP BY customer_id;
