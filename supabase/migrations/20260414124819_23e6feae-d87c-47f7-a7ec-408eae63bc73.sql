
-- Create vendors table
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  default_commission_rate NUMERIC NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create vendor_consignments table (stock entries from vendors, NOT purchases)
CREATE TABLE public.vendor_consignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  consignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_consignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.vendor_consignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create vendor_payments table
CREATE TABLE public.vendor_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.vendor_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create vendor_damages table
CREATE TABLE public.vendor_damages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  reason TEXT NOT NULL DEFAULT 'damaged',
  damage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_damages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON public.vendor_damages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add vendor fields to products
ALTER TABLE public.products ADD COLUMN vendor_id UUID REFERENCES public.vendors(id);
ALTER TABLE public.products ADD COLUMN commission_rate NUMERIC NOT NULL DEFAULT 0;
