-- Public self-registration for loyalty members (used by the /join page with the anon key).
-- Minimal exposure: anon may INSERT a new member + their first card token, nothing else.
-- No anon SELECT/UPDATE/DELETE, so no customer PII is ever readable without staff login.
-- WITH CHECK locks safe defaults (active member, active qr_card) and basic input sanity.

-- Data API access for the anon role (no-op if already granted).
GRANT INSERT ON public.loyalty_customers TO anon;
GRANT INSERT ON public.loyalty_identifiers TO anon;

-- Self-registration: one row per new member. Phone uniqueness is enforced by the
-- existing UNIQUE constraint, so re-registration attempts fail safe (no data leak).
DROP POLICY IF EXISTS "Anon self-registration insert" ON public.loyalty_customers;
CREATE POLICY "Anon self-registration insert"
  ON public.loyalty_customers
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'active'
    AND tier = 'member'
    AND char_length(full_name) BETWEEN 2 AND 120
    AND char_length(phone) BETWEEN 7 AND 20
  );

-- First card token for the just-registered member (client generates both UUIDs,
-- so no SELECT round-trip is needed).
DROP POLICY IF EXISTS "Anon self-registration card insert" ON public.loyalty_identifiers;
CREATE POLICY "Anon self-registration card insert"
  ON public.loyalty_identifiers
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'active'
    AND type = 'qr_card'
    AND char_length(token) BETWEEN 8 AND 32
  );
