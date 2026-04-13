-- Add settlement fields to internal_transactions
ALTER TABLE public.internal_transactions
ADD COLUMN settlement_method text DEFAULT NULL,
ADD COLUMN amount_settled numeric DEFAULT 0,
ADD COLUMN date_settled date DEFAULT NULL,
ADD COLUMN received_by text DEFAULT NULL;

-- Create production_batch_products for multi-product batches
CREATE TABLE public.production_batch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity_produced numeric NOT NULL,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_batch_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access"
ON public.production_batch_products
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_production_batch_products_updated_at
BEFORE UPDATE ON public.production_batch_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();