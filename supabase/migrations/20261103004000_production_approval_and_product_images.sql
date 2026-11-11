-- Add approval workflow to production_batches and images to products
ALTER TABLE public.production_batches 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Add image_url to products if not present
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image_url to raw_materials if not present
ALTER TABLE public.raw_materials 
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Index for pending batches
CREATE INDEX IF NOT EXISTS idx_production_batches_status ON public.production_batches(status);
