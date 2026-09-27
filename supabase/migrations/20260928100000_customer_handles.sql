-- Memorable member IDs: every loyalty customer gets a unique handle like
-- "wonderful-parrot" / "amazing-tiger" — easy to remember, quote and search.
--
-- Design: UUID stays the technical primary key (sales/ledger/redemptions all
-- reference it). `handle` is UNIQUE + NOT NULL and is the human primary
-- identifier. A BEFORE INSERT trigger assigns it on every path (public RPC,
-- staff registration, future imports), so no client can forget it.

ALTER TABLE public.loyalty_customers ADD COLUMN IF NOT EXISTS handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_customers_handle ON public.loyalty_customers(handle);

CREATE OR REPLACE FUNCTION public.generate_customer_handle()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  adjs text[] := ARRAY[
    'amazing','brave','bright','calm','cheerful','clever','cozy','eager','fresh',
    'gentle','glad','grand','happy','honest','jolly','joyful','kind','lively',
    'lucky','merry','nimble','noble','proud','quick','quiet','radiant','shiny',
    'silly','smart','sunny','swift','tidy','vivid','wise','wonderful','zesty',
    'zippy','bold','breezy','toasty','dazzling','earnest','fleet','glowing','gallant',
    'hearty','jumbo','keen','loyal','misty','nifty','perky'
  ];
  animals text[] := ARRAY[
    'parrot','tiger','lion','eagle','dolphin','panda','fox','owl','bear','wolf',
    'zebra','giraffe','koala','penguin','rabbit','squirrel','turtle','whale',
    'falcon','sparrow','cobra','jaguar','leopard','otter','beaver','bison',
    'camel','cheetah','crane','deer','dove','flamingo','gazelle','gecko',
    'hamster','heron','iguana','kangaroo','lemur','llama','lynx','macaw',
    'meerkat','monkey','moose','ocelot','osprey','ostrich','seal','swan'
  ];
  candidate text;
  i int;
BEGIN
  FOR i IN 1..60 LOOP
    candidate := adjs[1 + floor(random() * array_length(adjs, 1))::int]
      || '-' || animals[1 + floor(random() * array_length(animals, 1))::int];
    IF NOT EXISTS (SELECT 1 FROM public.loyalty_customers WHERE handle = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  -- Extremely full namespace: adjective-animal-NN fallback (still unique-checked).
  LOOP
    candidate := adjs[1 + floor(random() * array_length(adjs, 1))::int]
      || '-' || animals[1 + floor(random() * array_length(animals, 1))::int]
      || '-' || (10 + floor(random() * 89))::int;
    IF NOT EXISTS (SELECT 1 FROM public.loyalty_customers WHERE handle = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_customer_handle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.handle IS NULL OR btrim(NEW.handle) = '' THEN
    NEW.handle := public.generate_customer_handle();
  ELSE
    -- Normalize hand-typed handles: lowercase, hyphen-separated, safe chars only.
    NEW.handle := lower(regexp_replace(btrim(NEW.handle), '[^a-z0-9]+', '-', 'g'));
    NEW.handle := regexp_replace(NEW.handle, '(^-+|-+$)', '', 'g');
    IF NEW.handle = '' THEN
      NEW.handle := public.generate_customer_handle();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_customer_handle ON public.loyalty_customers;
CREATE TRIGGER assign_customer_handle
  BEFORE INSERT ON public.loyalty_customers
  FOR EACH ROW EXECUTE FUNCTION public.assign_customer_handle();

-- Backfill existing members one row at a time (each pick sees prior picks).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.loyalty_customers WHERE handle IS NULL ORDER BY created_at LOOP
    UPDATE public.loyalty_customers
    SET handle = public.generate_customer_handle()
    WHERE id = r.id;
  END LOOP;
END;
$$;

ALTER TABLE public.loyalty_customers ALTER COLUMN handle SET NOT NULL;

-- Public registration now also returns the new member's handle for the QR card.
DROP FUNCTION IF EXISTS public.register_loyalty_member(text, text, text, date, text, text, text, boolean);

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
RETURNS TABLE (customer_id uuid, token text, handle text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := gen_random_uuid();
  v_token text := '';
  v_handle text;
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

  v_handle := public.generate_customer_handle();

  INSERT INTO public.loyalty_customers
    (id, full_name, phone, email, birthday, area, age_range, gender, marketing_consent, consent_at, status, tier, handle)
  VALUES
    (v_customer_id, v_name, v_phone,
     NULLIF(btrim(p_email), ''), p_birthday,
     NULLIF(btrim(p_area), ''), NULLIF(btrim(p_age_range), ''), NULLIF(btrim(p_gender), ''),
     COALESCE(p_marketing_consent, false),
     CASE WHEN COALESCE(p_marketing_consent, false) THEN now() ELSE NULL END,
     'active', 'member', v_handle);

  INSERT INTO public.loyalty_identifiers (customer_id, token, type, status)
  VALUES (v_customer_id, v_token, 'qr_card', 'active');

  customer_id := v_customer_id;
  token := v_token;
  handle := v_handle;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.register_loyalty_member(text, text, text, date, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_loyalty_member(text, text, text, date, text, text, text, boolean) TO anon, authenticated;
