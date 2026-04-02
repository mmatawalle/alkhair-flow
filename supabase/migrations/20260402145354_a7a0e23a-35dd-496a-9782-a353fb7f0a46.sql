
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- RAW MATERIALS
-- ============================================
CREATE TABLE public.raw_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  purchase_unit TEXT NOT NULL DEFAULT 'bag',
  usage_unit TEXT NOT NULL DEFAULT 'mudu',
  current_stock NUMERIC NOT NULL DEFAULT 0,
  average_cost_per_usage_unit NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.raw_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_raw_materials_updated_at BEFORE UPDATE ON public.raw_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  bottle_size TEXT NOT NULL DEFAULT '50cl',
  category TEXT NOT NULL DEFAULT 'milkshake',
  selling_price NUMERIC NOT NULL DEFAULT 0,
  production_stock NUMERIC NOT NULL DEFAULT 0,
  shop_stock NUMERIC NOT NULL DEFAULT 0,
  latest_cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  average_cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PURCHASE RECORDS
-- ============================================
CREATE TABLE public.purchase_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  quantity_purchased NUMERIC NOT NULL,
  purchase_unit TEXT NOT NULL,
  converted_quantity NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  cost_per_usage_unit NUMERIC NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.purchase_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_purchase_records_updated_at BEFORE UPDATE ON public.purchase_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PRODUCTION BATCHES
-- ============================================
CREATE TABLE public.production_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_produced NUMERIC NOT NULL,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_batch_cost NUMERIC NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.production_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_production_batches_updated_at BEFORE UPDATE ON public.production_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PRODUCTION BATCH ITEMS
-- ============================================
CREATE TABLE public.production_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  quantity_used NUMERIC NOT NULL,
  unit_cost_used NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.production_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.production_batch_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_production_batch_items_updated_at BEFORE UPDATE ON public.production_batch_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TRANSFER RECORDS
-- ============================================
CREATE TABLE public.transfer_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  production_batch_id UUID REFERENCES public.production_batches(id) ON DELETE SET NULL,
  quantity_transferred NUMERIC NOT NULL,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transfer_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.transfer_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_transfer_records_updated_at BEFORE UPDATE ON public.transfer_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SALE RECORDS
-- ============================================
CREATE TABLE public.sale_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_sold NUMERIC NOT NULL,
  selling_price_per_unit NUMERIC NOT NULL,
  total_revenue NUMERIC NOT NULL,
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  total_cogs NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  sale_type TEXT NOT NULL DEFAULT 'cash',
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.sale_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_sale_records_updated_at BEFORE UPDATE ON public.sale_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- EXPENSE RECORDS
-- ============================================
CREATE TABLE public.expense_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_side TEXT NOT NULL DEFAULT 'shop',
  category_code TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  requested_by TEXT,
  payment_nature TEXT NOT NULL DEFAULT 'normal',
  linked_item TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.expense_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_expense_records_updated_at BEFORE UPDATE ON public.expense_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- GIFT RECORDS
-- ============================================
CREATE TABLE public.gift_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_location TEXT NOT NULL DEFAULT 'shop',
  quantity NUMERIC NOT NULL,
  gift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient TEXT,
  reason_category TEXT NOT NULL DEFAULT 'family',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gift_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.gift_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_gift_records_updated_at BEFORE UPDATE ON public.gift_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
