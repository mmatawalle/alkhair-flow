-- POS terminals + Bank accounts for sales (POS / transfer) channels
-- Each sale with sale_type = 'pos' may reference a pos_terminal
-- Each sale with sale_type = 'transfer' may reference a bank_account

-- 1. Bank accounts (transfer destinations)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.bank_accounts;
CREATE POLICY "Authenticated users full access" ON public.bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch ON public.bank_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON public.bank_accounts(is_active);

-- 2. POS terminals
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  terminal_id TEXT,
  bank_name TEXT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.pos_terminals;
CREATE POLICY "Authenticated users full access" ON public.pos_terminals FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_pos_terminals_updated_at ON public.pos_terminals;
CREATE TRIGGER update_pos_terminals_updated_at BEFORE UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_pos_terminals_branch ON public.pos_terminals(branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_active ON public.pos_terminals(is_active);

-- 3. Sales: link to channel records
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS pos_terminal_id UUID REFERENCES public.pos_terminals(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_pos_terminal ON public.sales(pos_terminal_id);
CREATE INDEX IF NOT EXISTS idx_sales_bank_account ON public.sales(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_sales_type_status ON public.sales(sale_type, status);
