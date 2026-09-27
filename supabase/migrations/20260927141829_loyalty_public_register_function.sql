-- Public loyalty self-registration via a single RPC (used by the /join page with the anon key).
--
-- Why a function instead of anon INSERT policies: anon table access would also need
-- anon SELECT for the INSERT ... RETURNING round-trip, which would expose customer
-- PII. The function runs the two inserts atomically and returns only the new
-- card token. It validates inputs and can only create rows (never read/update).
--
-- This supersedes 20260927141245 (anon INSERT policies), which are removed below
-- so the function is the only public write path.

DROP POLICY IF EXISTS "Anon self-registration insert" ON public.loyalty_customers;
DROP POLICY IF EXISTS "Anon self-registration card insert" ON public.loyalty_identifiers;
REVOKE INSERT ON public.loyalty_customers FROM anon;
REVOKE INSERT ON public.loyalty_identifiers FROM anon;

CREATE OR REPLACE FUNCTION public.register_loyalty_member(
  p_full_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_birthday date DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_age_range text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_marketing_consent boolean DEFAULT false
)
RETURNS TABLE (customer_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := gen_random_uuid();
  v_token text := '';
  v_name text := btrim(p_full_name);
  v_phone text := regexp_replace(btrim(p_phone), '[\s\-()]', '', 'g');
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF v_name IS NULL OR char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name' USING ERRCODE = 'P0001';
  END IF;
  IF v_phone IS NULL OR char_length(v_phone) < 7 OR char_length(v_phone) > 20 THEN
    RAISE EXCEPTION 'Please enter a valid phone number' USING ERRCODE = 'P0001';
  END IF;

  -- 12-char unambiguous token for the QR card (contains no PII).
  FOR i IN 1..12 LOOP
    v_token := v_token || substr(v_alphabet, (floor(random() * 32) + 1)::int, 1);
  END LOOP;

  INSERT INTO public.loyalty_customers
    (id, full_name, phone, email, birthday, area, age_range, gender, marketing_consent, consent_at, status, tier)
  VALUES
    (v_customer_id, v_name, v_phone,
     NULLIF(btrim(p_email), ''), p_birthday,
     NULLIF(btrim(p_area), ''), NULLIF(btrim(p_age_range), ''), NULLIF(btrim(p_gender), ''),
     COALESCE(p_marketing_consent, false),
     CASE WHEN COALESCE(p_marketing_consent, false) THEN now() ELSE NULL END,
     'active', 'member');

  INSERT INTO public.loyalty_identifiers (customer_id, token, type, status)
  VALUES (v_customer_id, v_token, 'qr_card', 'active');

  customer_id := v_customer_id;
  token := v_token;
  RETURN NEXT;
END;
$$;

-- Least privilege: only EXECUTE, only for the two app roles (anon = public join page).
REVOKE ALL ON FUNCTION public.register_loyalty_member(text, text, text, date, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_loyalty_member(text, text, text, date, text, text, text, boolean) TO anon, authenticated;
