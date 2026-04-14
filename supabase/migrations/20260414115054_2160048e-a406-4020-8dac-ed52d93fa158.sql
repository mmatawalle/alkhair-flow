
-- Audit log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT,
  performed_by TEXT,
  old_values JSONB,
  new_values JSONB,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs"
ON public.audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_audit_log_module ON public.audit_log(module);
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);

-- Stock adjustments table
CREATE TABLE public.stock_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type TEXT NOT NULL DEFAULT 'product',
  item_id UUID NOT NULL,
  location TEXT NOT NULL DEFAULT 'shop',
  old_quantity NUMERIC NOT NULL DEFAULT 0,
  new_quantity NUMERIC NOT NULL DEFAULT 0,
  adjustment_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'correction',
  affect_average_cost BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  adjusted_by TEXT,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access on stock_adjustments"
ON public.stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_stock_adjustments_item ON public.stock_adjustments(item_type, item_id);
