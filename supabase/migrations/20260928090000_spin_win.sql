-- Spin & Win (public guest game → loyalty registration nudge).
-- Guests spin free (guest_key in localStorage). Wins stay "pending" until the
-- guest registers via the existing register_loyalty_member() RPC, then
-- claim_spin_win() links the win and credits points / issues a voucher.
-- Odds are weights on spin_prizes; budgets are caps via max_wins.

-- ============================================
-- 1. TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS public.spin_wheels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Lucky Spin',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_spins_per_guest INTEGER NOT NULL DEFAULT 1,
  win_expiry_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spin_prizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wheel_id UUID NOT NULL REFERENCES public.spin_wheels(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  prize_type TEXT NOT NULL DEFAULT 'points' CHECK (prize_type IN ('points', 'discount', 'free_product', 'no_win')),
  points_amount INTEGER NOT NULL DEFAULT 0,
  value_amount NUMERIC,
  discount_percent NUMERIC,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
  max_wins INTEGER CHECK (max_wins IS NULL OR max_wins > 0),
  max_per_customer INTEGER NOT NULL DEFAULT 1 CHECK (max_per_customer > 0),
  color TEXT NOT NULL DEFAULT '#0d7a5f',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spin_plays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wheel_id UUID NOT NULL REFERENCES public.spin_wheels(id) ON DELETE CASCADE,
  prize_id UUID NOT NULL REFERENCES public.spin_prizes(id) ON DELETE SET NULL,
  guest_key TEXT NOT NULL,
  customer_id UUID REFERENCES public.loyalty_customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired', 'voided')),
  claim_token TEXT NOT NULL UNIQUE,
  voucher_code TEXT,
  points_credited INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.spin_wheels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_plays ENABLE ROW LEVEL SECURITY;

-- Staff (authenticated) keep full access, consistent with other loyalty tables.
DROP POLICY IF EXISTS "Authenticated users full access" ON public.spin_wheels;
CREATE POLICY "Authenticated users full access" ON public.spin_wheels FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users full access" ON public.spin_prizes;
CREATE POLICY "Authenticated users full access" ON public.spin_prizes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users full access" ON public.spin_plays;
CREATE POLICY "Authenticated users full access" ON public.spin_plays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public game board: anon may READ the active wheel + its active prizes only.
-- No anon INSERT/UPDATE/DELETE — spins go through play_spin_wheel().
DROP POLICY IF EXISTS "Anon read active wheels" ON public.spin_wheels;
CREATE POLICY "Anon read active wheels" ON public.spin_wheels FOR SELECT TO anon USING (is_active = true);
DROP POLICY IF EXISTS "Anon read active prizes" ON public.spin_prizes;
CREATE POLICY "Anon read active prizes" ON public.spin_prizes FOR SELECT TO anon USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_spin_prizes_wheel ON public.spin_prizes(wheel_id, is_active);
CREATE INDEX IF NOT EXISTS idx_spin_plays_guest ON public.spin_plays(wheel_id, guest_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_plays_prize ON public.spin_plays(prize_id, status);
CREATE INDEX IF NOT EXISTS idx_spin_plays_claim ON public.spin_plays(claim_token);
CREATE INDEX IF NOT EXISTS idx_spin_plays_customer ON public.spin_plays(customer_id);

DROP TRIGGER IF EXISTS update_spin_wheels_updated_at ON public.spin_wheels;
CREATE TRIGGER update_spin_wheels_updated_at BEFORE UPDATE ON public.spin_wheels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_spin_prizes_updated_at ON public.spin_prizes;
CREATE TRIGGER update_spin_prizes_updated_at BEFORE UPDATE ON public.spin_prizes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2. SEED: default wheel (8 segments: points + discount + free treat + no-win)
-- ============================================
INSERT INTO public.spin_wheels (id, name, description, is_active, max_spins_per_guest, win_expiry_days)
VALUES ('00000000-0000-0000-0000-000000000071', 'Al-Khair Lucky Spin', 'Spin free, win points, treats & discounts. Register to keep your win!', true, 1, 7)
ON CONFLICT (id) DO UPDATE SET is_active = true, description = EXCLUDED.description;

INSERT INTO public.spin_prizes (wheel_id, label, description, prize_type, points_amount, value_amount, discount_percent, weight, max_wins, max_per_customer, color, is_active, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000071', '50 PTS', '50 loyalty points', 'points', 50, NULL, NULL, 2, 20, 1, '#0d7a5f', true, 0),
  ('00000000-0000-0000-0000-000000000071', '20 PTS', '20 loyalty points', 'points', 20, NULL, NULL, 8, 200, 1, '#e07b39', true, 1),
  ('00000000-0000-0000-0000-000000000071', '10 PTS', '10 loyalty points', 'points', 10, NULL, NULL, 20, NULL, 1, '#0d7a5f', true, 2),
  ('00000000-0000-0000-0000-000000000071', '5 PTS', '5 loyalty points', 'points', 5, NULL, NULL, 25, NULL, 1, '#f2c14e', true, 3),
  ('00000000-0000-0000-0000-000000000071', '5% OFF', '5% off your next purchase (show voucher at till)', 'discount', 0, NULL, 5, 15, 300, 1, '#e07b39', true, 4),
  ('00000000-0000-0000-0000-000000000071', 'FREE TREAT', 'A free treat on your next visit (show voucher at till)', 'free_product', 0, NULL, NULL, 3, 30, 1, '#0d7a5f', true, 5),
  ('00000000-0000-0000-0000-000000000071', 'TRY AGAIN', 'So close — join loyalty for 5% off every day', 'no_win', 0, NULL, NULL, 22, NULL, 1, '#94a3b8', true, 6),
  ('00000000-0000-0000-0000-000000000071', '2 PTS', '2 loyalty points', 'points', 2, NULL, NULL, 25, NULL, 1, '#f2c14e', true, 7)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. RPC: play_spin_wheel — server-side weighted draw, caps + guest limits enforced
-- ============================================
CREATE OR REPLACE FUNCTION public.play_spin_wheel(p_wheel_id uuid, p_guest_key text)
RETURNS TABLE (play_id uuid, claim_token text, prize_id uuid, prize_label text, prize_type text, points_amount integer, value_amount numeric, discount_percent numeric, voucher_code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest text := btrim(p_guest_key);
  v_wheel spin_wheels%ROWTYPE;
  v_spins_used integer;
  v_total_weight bigint;
  v_roll numeric;
  v_running bigint := 0;
  v_prize spin_prizes%ROWTYPE;
  v_used bigint;
  v_claim text := '';
  v_voucher text;
  v_play_id uuid := gen_random_uuid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
  r record;
BEGIN
  IF v_guest IS NULL OR char_length(v_guest) < 8 OR char_length(v_guest) > 64 THEN
    RAISE EXCEPTION 'Invalid session. Please reload and try again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_wheel FROM spin_wheels WHERE id = p_wheel_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This spin game is not active right now.' USING ERRCODE = 'P0001';
  END IF;

  -- Guest cap: max_spins_per_guest total tries on this wheel.
  SELECT count(*) INTO v_spins_used FROM spin_plays WHERE wheel_id = p_wheel_id AND guest_key = v_guest;
  IF v_spins_used >= v_wheel.max_spins_per_guest THEN
    RAISE EXCEPTION 'You have used your free spin. Register to claim your win!' USING ERRCODE = 'P0001';
  END IF;

  -- Eligible prizes: active, weight > 0, budget (max_wins) not exhausted.
  SELECT COALESCE(sum(weight), 0) INTO v_total_weight
  FROM spin_prizes p
  WHERE p.wheel_id = p_wheel_id AND p.is_active AND p.weight > 0
    AND (p.max_wins IS NULL OR (SELECT count(*) FROM spin_plays s WHERE s.prize_id = p.id AND s.status IN ('pending', 'claimed')) < p.max_wins);

  IF v_total_weight <= 0 THEN
    RAISE EXCEPTION 'Prizes are exhausted — please try again later.' USING ERRCODE = 'P0001';
  END IF;

  v_roll := floor(random() * v_total_weight);

  FOR r IN
    SELECT * FROM spin_prizes p
    WHERE p.wheel_id = p_wheel_id AND p.is_active AND p.weight > 0
      AND (p.max_wins IS NULL OR (SELECT count(*) FROM spin_plays s WHERE s.prize_id = p.id AND s.status IN ('pending', 'claimed')) < p.max_wins)
    ORDER BY p.sort_order, p.id
  LOOP
    IF v_roll < v_running + r.weight THEN
      v_prize := r;
      EXIT;
    END IF;
    v_running := v_running + r.weight;
  END LOOP;

  IF v_prize.id IS NULL THEN
    SELECT * INTO v_prize FROM spin_prizes WHERE wheel_id = p_wheel_id AND prize_type = 'no_win' AND is_active LIMIT 1;
    IF v_prize.id IS NULL THEN
      RAISE EXCEPTION 'Spin failed — please try again.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Tokens: claim_token (12-char) to claim after registration; voucher (8-char) for till.
  FOR i IN 1..12 LOOP
    v_claim := v_claim || substr(v_alphabet, (floor(random() * 32) + 1)::int, 1);
  END LOOP;
  IF v_prize.prize_type IN ('discount', 'free_product') THEN
    v_voucher := '';
    FOR i IN 1..8 LOOP
      v_voucher := v_voucher || substr(v_alphabet, (floor(random() * 32) + 1)::int, 1);
    END LOOP;
  END IF;

  INSERT INTO spin_plays (id, wheel_id, prize_id, guest_key, status, claim_token, voucher_code, expires_at)
  VALUES (v_play_id, p_wheel_id, v_prize.id, v_guest, 'pending', v_claim, v_voucher, now() + (v_wheel.win_expiry_days || ' days')::interval);

  play_id := v_play_id;
  claim_token := v_claim;
  prize_id := v_prize.id;
  prize_label := v_prize.label;
  prize_type := v_prize.prize_type;
  points_amount := v_prize.points_amount;
  value_amount := v_prize.value_amount;
  discount_percent := v_prize.discount_percent;
  voucher_code := v_voucher;
  expires_at := now() + (v_wheel.win_expiry_days || ' days')::interval;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.play_spin_wheel(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_spin_wheel(uuid, text) TO anon, authenticated;

-- ============================================
-- 4. RPC: claim_spin_win — after register_loyalty_member(); credits points, links win
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_spin_win(p_claim_token text, p_customer_id uuid)
RETURNS TABLE (prize_label text, prize_type text, points_credited integer, voucher_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_play spin_plays%ROWTYPE;
  v_prize spin_prizes%ROWTYPE;
  v_cust loyalty_customers%ROWTYPE;
  v_prior bigint;
BEGIN
  SELECT * INTO v_play FROM spin_plays WHERE claim_token = btrim(p_claim_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Win not found. It may have expired.' USING ERRCODE = 'P0001';
  END IF;
  IF v_play.status = 'claimed' THEN
    -- Idempotent: already claimed (e.g., double submit) — return current state.
    SELECT * INTO v_prize FROM spin_prizes WHERE id = v_play.prize_id;
    prize_label := v_prize.label;
    prize_type := v_prize.prize_type;
    points_credited := v_play.points_credited;
    voucher_code := v_play.voucher_code;
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_play.status <> 'pending' THEN
    RAISE EXCEPTION 'This win is no longer valid.' USING ERRCODE = 'P0001';
  END IF;
  IF v_play.expires_at < now() THEN
    UPDATE spin_plays SET status = 'expired' WHERE id = v_play.id;
    RAISE EXCEPTION 'This win has expired.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_cust FROM loyalty_customers WHERE id = p_customer_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_prize FROM spin_prizes WHERE id = v_play.prize_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prize no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  -- One win of this prize per customer (prevents farming via re-spin accounts).
  SELECT count(*) INTO v_prior FROM spin_plays WHERE prize_id = v_prize.id AND customer_id = p_customer_id AND status = 'claimed';
  IF v_prior >= v_prize.max_per_customer THEN
    RAISE EXCEPTION 'This reward was already claimed on your account.' USING ERRCODE = 'P0001';
  END IF;

  IF v_prize.prize_type = 'points' AND v_prize.points_amount > 0 THEN
    INSERT INTO loyalty_points_ledger (customer_id, points, entry_type, reason)
    VALUES (p_customer_id, v_prize.points_amount, 'earn', 'Spin & Win: ' || v_prize.label);
  END IF;

  UPDATE spin_plays
  SET status = 'claimed', customer_id = p_customer_id, claimed_at = now(),
      points_credited = CASE WHEN v_prize.prize_type = 'points' THEN v_prize.points_amount ELSE 0 END
  WHERE id = v_play.id;

  SELECT * INTO v_play FROM spin_plays WHERE id = v_play.id;
  prize_label := v_prize.label;
  prize_type := v_prize.prize_type;
  points_credited := v_play.points_credited;
  voucher_code := v_play.voucher_code;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_spin_win(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_spin_win(text, uuid) TO anon, authenticated;
