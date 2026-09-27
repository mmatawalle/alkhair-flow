import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { sendLoyaltyCardIssuedEmail, sendLoyaltyRedeemedEmail } from "@/lib/email";

/** Loyalty engine: pure point math (testable) + Supabase data layer.
 *  Balance is ALWAYS derived: SUM(loyalty_points_ledger.points) per customer.
 *  Never store an editable balance column.
 */

export interface LoyaltyRule {
  id: string;
  amount_per_point: number;
  min_spend: number;
  point_expiry_days: number;
  redemption_value_per_point: number;
  member_discount_percent: number;
}

export interface EarnLine {
  product_id: string;
  category: string | null;
  line_total: number;
}

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

/** Random non-guessable loyalty token for QR/cards. Contains no PII. */
export function generateLoyaltyToken(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

/** Pure points math: floor(eligible_total / amount_per_point) * multiplier. */
export function calculateEarnPoints(
  lines: EarnLine[],
  rule: Pick<LoyaltyRule, "amount_per_point" | "min_spend">,
  excludedProductIds: Set<string> = new Set(),
  excludedCategories: Set<string> = new Set(),
  multiplier = 1,
): { eligibleTotal: number; points: number } {
  const perPoint = Number(rule.amount_per_point);
  if (!perPoint || perPoint <= 0) return { eligibleTotal: 0, points: 0 };
  const eligibleTotal = lines.reduce((sum, l) => {
    if (excludedProductIds.has(l.product_id)) return sum;
    if (l.category && excludedCategories.has(l.category)) return sum;
    return sum + Number(l.line_total || 0);
  }, 0);
  if (eligibleTotal < Number(rule.min_spend || 0)) return { eligibleTotal, points: 0 };
  return { eligibleTotal, points: Math.floor(eligibleTotal / perPoint) * multiplier };
}

/** Pure balance derivation from ledger entries. */
export function sumLedgerBalance(entries: { points: number | string }[]): number {
  return entries.reduce((s, e) => s + Number(e.points || 0), 0);
}

/** Normalize a phone number for matching: strip spaces, dashes, brackets. */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()]/g, "");
}

/** Normalize a member handle for matching: lowercase, hyphen-separated. */
export function normalizeHandle(handle: string): string {
  return handle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Pure member-discount math: percent off subtotal, rounded to whole Naira, never negative. */
export function calculateMemberDiscount(subtotal: number, percent: number | null | undefined): number {
  const pct = Number(percent || 0);
  const sub = Number(subtotal || 0);
  if (!pct || pct <= 0 || !sub || sub <= 0) return 0;
  const capped = Math.min(pct, 100);
  return Math.min(Math.round((sub * capped) / 100), Math.round(sub));
}

export async function fetchActiveRule(): Promise<LoyaltyRule | null> {
  const { data, error } = await supabase
    .from("loyalty_rules")
    .select("id, amount_per_point, min_spend, point_expiry_days, redemption_value_per_point, member_discount_percent")
    .eq("scope", "global")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as LoyaltyRule | null;
}

export async function fetchExclusions(): Promise<{ products: Set<string>; categories: Set<string> }> {
  const [p, c] = await Promise.all([
    supabase.from("loyalty_product_exclusions").select("product_id"),
    supabase.from("loyalty_category_exclusions").select("category"),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  return {
    products: new Set((p.data || []).map((r: any) => r.product_id)),
    categories: new Set((c.data || []).map((r: any) => r.category)),
  };
}

export interface LoyaltyCustomer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  status: string;
  tier: string;
  /** Memorable unique member ID, e.g. "wonderful-parrot". */
  handle?: string | null;
  area?: string | null;
  age_range?: string | null;
  gender?: string | null;
  marketing_consent?: boolean | null;
}

/** Resolve by QR token (active identifiers only), exact phone number, or member handle. */
export async function resolveCustomer(input: { token?: string; phone?: string; handle?: string }): Promise<LoyaltyCustomer | null> {
  if (input.token) {
    const { data, error } = await supabase
      .from("loyalty_identifiers")
      .select("customer_id, loyalty_customers(*)")
      .eq("token", input.token.trim().toUpperCase())
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return (data?.loyalty_customers as unknown as LoyaltyCustomer) || null;
  }
  if (input.phone) {
    const phone = normalizePhone(input.phone);
    const { data, error } = await supabase
      .from("loyalty_customers")
      .select("*")
      .eq("phone", phone)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return (data as LoyaltyCustomer) || null;
  }
  if (input.handle) {
    const handle = normalizeHandle(input.handle);
    const { data, error } = await supabase
      .from("loyalty_customers")
      .select("*")
      .eq("handle", handle)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return (data as LoyaltyCustomer) || null;
  }
  return null;
}

/** Search customers by name, phone, email or memorable member ID (active only). */
export async function searchCustomers(query: string, limit = 8): Promise<LoyaltyCustomer[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  // Escape % and _ for ilike, then use or filter
  const esc = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const pattern = `%${esc}%`;
  const handlePattern = `%${normalizeHandle(q)}%`;
  // Also try token match via identifiers — if query looks like token, include those customers
  const isTokenLike = /^[A-Z0-9]{6,}$/i.test(q);
  if (isTokenLike) {
    const { data: ident } = await supabase
      .from("loyalty_identifiers")
      .select("customer_id, loyalty_customers(*)")
      .ilike("token", pattern)
      .eq("status", "active")
      .limit(limit);
    const fromToken = ((ident as any[]) || []).map((r) => r.loyalty_customers).filter(Boolean) as LoyaltyCustomer[];
    if (fromToken.length) return fromToken.slice(0, limit);
  }
  const { data, error } = await supabase
    .from("loyalty_customers")
    .select("*")
    .eq("status", "active")
    .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},handle.ilike.${handlePattern}`)
    .order("full_name")
    .limit(limit);
  if (error) throw error;
  return (data as LoyaltyCustomer[]) || [];
}

export async function fetchBalance(customerId: string): Promise<number> {
  const { data, error } = await supabase
    .from("loyalty_points_ledger")
    .select("points")
    .eq("customer_id", customerId);
  if (error) throw error;
  return sumLedgerBalance(data || []);
}

export async function registerCustomer(input: {
  full_name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
  branch_created_id?: string | null;
  area?: string | null;
  age_range?: string | null;
  gender?: string | null;
  marketing_consent?: boolean | null;
}): Promise<{ customer: LoyaltyCustomer; token: string }> {
  const name = input.full_name.trim();
  const phone = normalizePhone(input.phone);
  if (!name) throw new Error("Full name is required");
  if (!phone) throw new Error("Phone number is required");
  const { data: { user } } = await supabase.auth.getUser();
  const { data: customer, error: cErr } = await supabase
    .from("loyalty_customers")
    .insert({
      full_name: name,
      phone,
      email: input.email?.trim() || null,
      birthday: input.birthday || null,
      branch_created_id: input.branch_created_id || null,
      area: input.area?.trim() || null,
      age_range: input.age_range || null,
      gender: input.gender || null,
      marketing_consent: !!input.marketing_consent,
      consent_at: input.marketing_consent ? new Date().toISOString() : null,
      created_by: user?.id || null,
    })
    .select("*")
    .single();
  if (cErr) throw cErr;

  const token = generateLoyaltyToken();
  const { error: tErr } = await supabase
    .from("loyalty_identifiers")
    .insert({ customer_id: customer.id, token, type: "qr_card", status: "active" });
  if (tErr) throw tErr;

  await logAudit({
    action_type: "create",
    module: "loyalty_customers",
    record_id: customer.id,
    new_values: { full_name: customer.full_name, phone: customer.phone },
    note: "Loyalty registration",
  });
  if (customer.email) {
    void sendLoyaltyCardIssuedEmail({ to: customer.email, name: customer.full_name, token });
  }
  return { customer: customer as LoyaltyCustomer, token };
}

/** Deactivate one identifier (lost card) and issue a fresh token. History stays on the customer. */
export async function reissueIdentifier(identifierId: string): Promise<string> {
  const { data: ident, error: fErr } = await supabase
    .from("loyalty_identifiers")
    .select("id, customer_id")
    .eq("id", identifierId)
    .single();
  if (fErr) throw fErr;
  await supabase.from("loyalty_identifiers").update({ status: "lost" }).eq("id", identifierId);
  const token = generateLoyaltyToken();
  const { error: iErr } = await supabase
    .from("loyalty_identifiers")
    .insert({ customer_id: (ident as any).customer_id, token, type: "qr_card", status: "active" });
  if (iErr) throw iErr;
  await logAudit({ action_type: "update", module: "loyalty_identifiers", record_id: identifierId, note: "Card reissued (old marked lost)" });
  return token;
}

export async function postLedgerEntry(input: {  customer_id: string;
  points: number;
  entry_type: "earn" | "redeem" | "adjust" | "expire" | "void";
  reason?: string | null;
  sale_id?: string | null;
  branch_id?: string | null;
}): Promise<void> {
  if (!Number.isInteger(input.points) || input.points === 0) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("loyalty_points_ledger").insert({
    customer_id: input.customer_id,
    points: input.points,
    entry_type: input.entry_type,
    reason: input.reason || null,
    sale_id: input.sale_id || null,
    branch_id: input.branch_id || null,
    cashier_id: user?.id || null,
  });
  if (error) throw error;
  await logAudit({
    action_type: input.entry_type === "adjust" ? "adjust" : input.entry_type,
    module: "loyalty_ledger",
    record_id: input.customer_id,
    new_values: { points: input.points, reason: input.reason, sale_id: input.sale_id },
  });
}

export async function fetchAffordableRewards(customerId: string) {
  const [rewardsRes, balance] = await Promise.all([
    supabase.from("loyalty_rewards").select("*").eq("is_active", true).order("points_cost"),
    fetchBalance(customerId),
  ]);
  if (rewardsRes.error) throw rewardsRes.error;
  const affordable = (rewardsRes.data as any[]).filter((r) => balance >= Number(r.points_cost));
  return { balance, rewards: rewardsRes.data as any[], affordable };
}

export async function getActiveCampaignMultiplier(saleDate: string, lines: EarnLine[]): Promise<number> {
  const { data, error } = await supabase
    .from("loyalty_campaigns")
    .select("multiplier, conditions, starts_at, ends_at")
    .eq("is_active", true)
    .lte("starts_at", saleDate)
    .or(`ends_at.is.null,ends_at.gte.${saleDate}`);
  if (error || !data?.length) return 1;
  let max = 1;
  for (const c of data as any[]) {
    const cond = c.conditions as any;
    const m = Number(c.multiplier || 1);
    if (m <= max) continue;
    if (!cond || Object.keys(cond).length === 0) {
      max = m; // global
      continue;
    }
    // product-specific: {product_id: "uuid"} or category
    if (cond.product_id && lines.some((l) => l.product_id === cond.product_id)) max = m;
    else if (cond.category && lines.some((l) => l.category === cond.category)) max = m;
    else if (cond.min_spend && lines.reduce((s, l) => s + l.line_total, 0) >= Number(cond.min_spend)) max = m;
  }
  return max;
}

/** Redeem a reward: validates balance, writes redeem ledger entry + redemption record. */
export async function redeemReward(input: {
  customer_id: string;
  reward_id: string;
  branch_id?: string | null;
  sale_id?: string | null;
}): Promise<void> {
  const [{ data: reward, error: rErr }, balance] = await Promise.all([
    supabase.from("loyalty_rewards").select("id, name, points_cost, is_active").eq("id", input.reward_id).single(),
    fetchBalance(input.customer_id),
  ]);
  if (rErr) throw rErr;
  if (!(reward as any)?.is_active) throw new Error("Reward is not active");
  if (balance < Number((reward as any).points_cost)) {
    throw new Error(`Insufficient points (have ${balance}, need ${(reward as any).points_cost})`);
  }
  const { data: { user } } = await supabase.auth.getUser();

  const { data: redemption, error: dErr } = await supabase
    .from("loyalty_redemptions")
    .insert({
      customer_id: input.customer_id,
      reward_id: input.reward_id,
      points_spent: (reward as any).points_cost,
      sale_id: input.sale_id || null,
      branch_id: input.branch_id || null,
      cashier_id: user?.id || null,
      status: "completed",
    })
    .select("id")
    .single();
  if (dErr) throw dErr;

  const { error: lErr } = await supabase.from("loyalty_points_ledger").insert({
    customer_id: input.customer_id,
    points: -Number((reward as any).points_cost),
    entry_type: "redeem",
    reason: `Redeemed: ${(reward as any).name}`,
    sale_id: input.sale_id || null,
    branch_id: input.branch_id || null,
    cashier_id: user?.id || null,
  });
  if (lErr) throw lErr;

  await logAudit({
    action_type: "redeem",
    module: "loyalty_redemptions",
    record_id: (redemption as any).id,
    new_values: { customer_id: input.customer_id, reward: (reward as any).name, points: (reward as any).points_cost },
  });
  // Email (non-blocking) if customer has email
  void (async () => {
    const { data: cust } = await supabase.from("loyalty_customers").select("full_name, email").eq("id", input.customer_id).single();
    if (cust?.email) {
      const bal = await fetchBalance(input.customer_id);
      void sendLoyaltyRedeemedEmail({
        to: cust.email,
        name: cust.full_name,
        rewardName: (reward as any).name,
        pointsSpent: Number((reward as any).points_cost),
        totalBalance: bal,
      });
    }
  })();
}
