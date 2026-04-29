CREATE TABLE public.ai_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_type TEXT NOT NULL CHECK (draft_type IN ('transfer', 'production_batch', 'purchase', 'expense', 'unknown')),
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'image', 'pdf')),
  raw_input TEXT NOT NULL,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'needs_review', 'approved', 'rejected', 'posted')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ai drafts"
ON public.ai_drafts
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert ai drafts"
ON public.ai_drafts
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated users can update ai drafts"
ON public.ai_drafts
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_ai_drafts_updated_at
BEFORE UPDATE ON public.ai_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
