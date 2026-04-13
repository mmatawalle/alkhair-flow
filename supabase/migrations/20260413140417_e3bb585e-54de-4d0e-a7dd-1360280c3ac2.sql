
-- Create internal_transactions table
CREATE TABLE public.internal_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_type text NOT NULL DEFAULT 'product',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  taken_by text,
  given_by text,
  status text NOT NULL DEFAULT 'pending',
  source_location text NOT NULL DEFAULT 'shop',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  voided boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access"
ON public.internal_transactions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Add voided column to critical records
ALTER TABLE public.sale_records ADD COLUMN voided boolean NOT NULL DEFAULT false;
ALTER TABLE public.transfer_records ADD COLUMN voided boolean NOT NULL DEFAULT false;
ALTER TABLE public.production_batches ADD COLUMN voided boolean NOT NULL DEFAULT false;
