import { supabase } from "@/integrations/supabase/client";

/** Spin & Win engine: pure odds math (testable) + Supabase data layer.
 *  Guests spin free with a guest_key (localStorage). Wins stay "pending"
 *  until registration, then claim_spin_win() credits points / issues voucher.
 */

export type SpinPrizeType = "points" | "discount" | "free_product" | "no_win";

export interface SpinPrize {
  id: string;
  wheel_id: string;
  label: string;
  description: string | null;
  prize_type: SpinPrizeType;
  points_amount: number;
  value_amount: number | null;
  discount_percent: number | null;
  product_id: string | null;
  weight: number;
  max_wins: number | null;
  max_per_customer: number;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface SpinWheel {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  max_spins_per_guest: number;
  win_expiry_days: number;
}

export interface SpinResult {
  play_id: string;
  claim_token: string;
  prize_id: string;
  prize_label: string;
  prize_type: SpinPrizeType;
  points_amount: number;
  value_amount: number | null;
  discount_percent: number | null;
  voucher_code: string | null;
  expires_at: string;
}

const GUEST_KEY = "alkhair_spin_guest";
const PENDING_KEY = "alkhair_spin_pending";

export function getGuestKey(): string {
  try {
    let k = localStorage.getItem(GUEST_KEY);
    if (!k) {
      k = `g_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(GUEST_KEY, k);
    }
    return k;
  } catch {
    return `g_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function savePendingWin(win: SpinResult): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(win));
  } catch { /* noop */ }
}

export function loadPendingWin(): SpinResult | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as SpinResult) : null;
  } catch {
    return null;
  }
}

export function clearPendingWin(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch { /* noop */ }
}

/** Weighted pick over eligible prizes. random01 in [0,1). Returns null when empty. */
export function pickWeightedPrize<T extends { weight: number }>(prizes: T[], random01: number): T | null {
  const total = prizes.reduce((s, p) => s + Math.max(0, Number(p.weight) || 0), 0);
  if (total <= 0 || prizes.length === 0) return null;
  const r = Math.min(Math.max(random01, 0), 0.999999999) * total;
  let acc = 0;
  for (const p of prizes) {
    acc += Math.max(0, Number(p.weight) || 0);
    if (r < acc) return p;
  }
  return prizes[prizes.length - 1];
}

/** Remove prizes whose capped budget (max_wins) is exhausted. winCounts: prizeId → used. */
export function eligiblePrizes<T extends { id: string; weight: number; max_wins: number | null }>(
  prizes: T[],
  winCounts: Map<string, number> | Record<string, number>,
): T[] {
  const countOf = (id: string) =>
    winCounts instanceof Map ? winCounts.get(id) || 0 : winCounts[id] || 0;
  return prizes.filter(
    (p) => p.weight > 0 && (p.max_wins == null || countOf(p.id) < p.max_wins),
  );
}

/** Odds share (0–100) for display, e.g. "Adjustable odds". */
export function oddsPercent(weight: number, totalWeight: number): number {
  if (!totalWeight || totalWeight <= 0) return 0;
  return (Math.max(0, weight) / totalWeight) * 100;
}

/** Segment geometry for the SVG wheel: start angle + sweep per prize (degrees). */
export function wheelSegments<T>(prizes: T[], weightOf: (p: T) => number = () => 1): { prize: T; start: number; sweep: number }[] {
  const total = prizes.reduce((s, p) => s + Math.max(0, weightOf(p)), 0);
  const n = prizes.length;
  if (n === 0) return [];
  let start = 0;
  return prizes.map((prize) => {
    const w = total > 0 ? Math.max(0, weightOf(prize)) : 1;
    const sweep = total > 0 ? (w / total) * 360 : 360 / n;
    const seg = { prize, start, sweep };
    start += sweep;
    return seg;
  });
}

/** Short human line for a prize, used in toasts/lists. */
export function prizeShortText(p: Pick<SpinPrize, "label" | "prize_type" | "points_amount" | "discount_percent" | "value_amount">): string {
  if (p.prize_type === "points") return `${p.points_amount} points`;
  if (p.prize_type === "discount") {
    if (p.discount_percent) return `${p.discount_percent}% off`;
    if (p.value_amount) return `₦${Number(p.value_amount).toLocaleString()} off`;
    return "discount";
  }
  if (p.prize_type === "free_product") return "free treat";
  return "no win";
}

/** Header line for the registration modal — must display the win so the user
 *  doesn't feel like losing the points. */
export function winHeaderText(p: { prize_label: string; prize_type: SpinPrizeType; points_amount?: number | null }): string {
  if (p.prize_type === "no_win") return "So close — join anyway & save 5% every day";
  if (p.prize_type === "points") return `You won ${p.points_amount} POINTS 🎉`;
  return `You won ${p.prize_label} 🎉`;
}

/** Demo board (used when DB not yet migrated / offline). Mirrors seeded wheel. */
export const DEMO_WHEEL: SpinWheel = {
  id: "demo-wheel",
  name: "Al-Khair Lucky Spin",
  description: "Spin free, win points, treats & discounts. Register to keep your win!",
  is_active: true,
  max_spins_per_guest: 1,
  win_expiry_days: 7,
};

const demoColors = ["#0d7a5f", "#e07b39", "#0d7a5f", "#f2c14e", "#e07b39", "#0d7a5f", "#94a3b8", "#f2c14e"];

export const DEMO_PRIZES: SpinPrize[] = [
  { id: "d1", wheel_id: "demo-wheel", label: "50 PTS", description: "50 loyalty points", prize_type: "points", points_amount: 50, value_amount: null, discount_percent: null, product_id: null, weight: 2, max_wins: 20, max_per_customer: 1, color: demoColors[0], is_active: true, sort_order: 0 },
  { id: "d2", wheel_id: "demo-wheel", label: "20 PTS", description: "20 loyalty points", prize_type: "points", points_amount: 20, value_amount: null, discount_percent: null, product_id: null, weight: 8, max_wins: 200, max_per_customer: 1, color: demoColors[1], is_active: true, sort_order: 1 },
  { id: "d3", wheel_id: "demo-wheel", label: "10 PTS", description: "10 loyalty points", prize_type: "points", points_amount: 10, value_amount: null, discount_percent: null, product_id: null, weight: 20, max_wins: null, max_per_customer: 1, color: demoColors[2], is_active: true, sort_order: 2 },
  { id: "d4", wheel_id: "demo-wheel", label: "5 PTS", description: "5 loyalty points", prize_type: "points", points_amount: 5, value_amount: null, discount_percent: null, product_id: null, weight: 25, max_wins: null, max_per_customer: 1, color: demoColors[3], is_active: true, sort_order: 3 },
  { id: "d5", wheel_id: "demo-wheel", label: "5% OFF", description: "5% off your next purchase", prize_type: "discount", points_amount: 0, value_amount: null, discount_percent: 5, product_id: null, weight: 15, max_wins: 300, max_per_customer: 1, color: demoColors[4], is_active: true, sort_order: 4 },
  { id: "d6", wheel_id: "demo-wheel", label: "FREE TREAT", description: "A free treat on your next visit", prize_type: "free_product", points_amount: 0, value_amount: null, discount_percent: null, product_id: null, weight: 3, max_wins: 30, max_per_customer: 1, color: demoColors[5], is_active: true, sort_order: 5 },
  { id: "d7", wheel_id: "demo-wheel", label: "TRY AGAIN", description: "So close", prize_type: "no_win", points_amount: 0, value_amount: null, discount_percent: null, product_id: null, weight: 22, max_wins: null, max_per_customer: 1, color: demoColors[6], is_active: true, sort_order: 6 },
  { id: "d8", wheel_id: "demo-wheel", label: "2 PTS", description: "2 loyalty points", prize_type: "points", points_amount: 2, value_amount: null, discount_percent: null, product_id: null, weight: 25, max_wins: null, max_per_customer: 1, color: demoColors[7], is_active: true, sort_order: 7 },
];

export function demoSpin(guestKey: string): SpinResult {
  const prize = pickWeightedPrize(DEMO_PRIZES, Math.random()) || DEMO_PRIZES[3];
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return {
    play_id: `demo-${Date.now()}`,
    claim_token: `DEMO${rand}`.slice(0, 12),
    prize_id: prize.id,
    prize_label: prize.label,
    prize_type: prize.prize_type,
    points_amount: prize.points_amount,
    value_amount: prize.value_amount,
    discount_percent: prize.discount_percent,
    voucher_code: prize.prize_type === "discount" || prize.prize_type === "free_product" ? rand.slice(0, 8) : null,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}

export async function fetchActiveWheel(): Promise<{ wheel: SpinWheel; prizes: SpinPrize[]; demo: boolean }> {
  try {
    const sb = supabase as any;
    const { data: wheels, error: wErr } = await sb
      .from("spin_wheels")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    if (wErr) throw wErr;
    const wheel = (wheels as unknown as SpinWheel[])?.[0];
    if (!wheel) throw new Error("no wheel");
    const { data: prizes, error: pErr } = await sb
      .from("spin_prizes")
      .select("*")
      .eq("wheel_id", wheel.id)
      .eq("is_active", true)
      .order("sort_order");
    if (pErr) throw pErr;
    const list = (prizes as unknown as SpinPrize[]) || [];
    if (!list.length) throw new Error("no prizes");
    return { wheel: wheel as SpinWheel, prizes: list, demo: false };
  } catch {
    return { wheel: DEMO_WHEEL, prizes: DEMO_PRIZES, demo: true };
  }
}

function rpcErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { message?: string })?.message || "";
  if (/free spin|register to claim/i.test(msg)) return "You have used your free spin. Register below to claim your win — it's saved!";
  if (/not active|exhausted|try again later/i.test(msg)) return msg || fallback;
  return msg || fallback;
}

/** Server-side spin (weighted + caps enforced in DB). Falls back to demo board offline. */
export async function playSpin(wheelId: string, guestKey: string, demo: boolean): Promise<{ result: SpinResult; demo: boolean }> {
  if (demo || wheelId === "demo-wheel") {
    return { result: demoSpin(guestKey), demo: true };
  }
  try {
    const sb = supabase as any;
    const { data, error } = await sb.rpc("play_spin_wheel", {
      p_wheel_id: wheelId,
      p_guest_key: guestKey,
    });
    if (error) throw error;
    const row = (data as unknown as SpinResult[] | SpinResult | null);
    const r = (Array.isArray(row) ? row[0] : row) as SpinResult | undefined;
    if (!r?.claim_token) throw new Error("Spin failed — please try again.");
    return { result: r, demo: false };
  } catch (err) {
    const msg = (err as { message?: string })?.message || "";
    // Limit / inactive errors must surface (not silently demo-spin).
    if (/free spin|not active|exhausted|Invalid session/i.test(msg)) {
      throw new Error(rpcErrorMessage(err, "Spin failed — please try again."));
    }
    return { result: demoSpin(guestKey), demo: true };
  }
}

/** Register (existing public RPC) then claim the pending win. */
export async function registerAndClaimWin(input: {
  full_name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
  area?: string | null;
  age_range?: string | null;
  gender?: string | null;
  marketing_consent?: boolean;
  claim_token: string;
  demo: boolean;
}): Promise<{ customerToken: string; customerHandle: string | null; prize_label: string; prize_type: SpinPrizeType; points_credited: number; voucher_code: string | null }> {
  const sb = supabase as any;
  const { data, error } = await sb.rpc("register_loyalty_member", {
    p_full_name: input.full_name.trim(),
    p_phone: input.phone.trim(),
    p_email: input.email?.trim() || null,
    p_birthday: input.birthday || null,
    p_area: input.area?.trim() || null,
    p_age_range: input.age_range || null,
    p_gender: input.gender || null,
    p_marketing_consent: !!input.marketing_consent,
  });
  if (error) throw error;
  const row = (data as unknown as { customer_id: string; token: string; handle: string | null }[] | null)?.[0];
  if (!row?.token || !row?.customer_id) throw new Error("Registration failed");
  void guestKeyUnchanged;

  if (input.demo || input.claim_token.startsWith("DEMO")) {
    // Demo mode: no server claim row — surface the prize from the pending win.
    const pending = loadPendingWin();
    return {
      customerToken: row.token,
      customerHandle: row.handle || null,
      prize_label: pending?.prize_label || "win",
      prize_type: (pending?.prize_type as SpinPrizeType) || "points",
      points_credited: 0,
      voucher_code: pending?.voucher_code || null,
    };
  }

  const { data: claimed, error: cErr } = await sb.rpc("claim_spin_win", {
    p_claim_token: input.claim_token,
    p_customer_id: row.customer_id,
  });
  if (cErr) throw cErr;
  const c = (claimed as unknown as { prize_label: string; prize_type: SpinPrizeType; points_credited: number; voucher_code: string | null }[] | null)?.[0];
  if (!c) throw new Error("Claim failed — show your win at the till and staff will help.");
  return { customerToken: row.token, customerHandle: row.handle || null, ...c };
}

const guestKeyUnchanged = true;

/** Absolute public URL for the guest-facing pages (spin game / join form). */
export function publicGameUrl(path: "spin" | "join"): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) || "/";
  const normalized = base.endsWith("/") ? base : base + "/";
  return window.location.origin + normalized + path;
}
