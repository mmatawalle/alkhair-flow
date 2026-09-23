import { supabase } from "@/integrations/supabase/client";

/** Branch-aware inventory layer (normalized).
 *
 *  Canonical stock lives in `product_stock_levels` (product_id, branch_id).
 *  During transition every mutation ALSO mirrors the legacy
 *  products.shop_stock / online_shop_stock / production_stock columns so
 *  pages not yet migrated keep working. Reads prefer the normalized table
 *  and fall back to legacy columns when a level row is missing.
 */

export const BRANCH_CODES = { PROD: "PROD", SHOP: "SHOP", ONLINE: "ONLINE" } as const;

export type Branch = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
};

/** Legacy location strings used across the codebase -> branch code. */
export function locationToBranchCode(location: string | null | undefined): string {
  if (location === "online_shop") return BRANCH_CODES.ONLINE;
  if (location === "production") return BRANCH_CODES.PROD;
  return BRANCH_CODES.SHOP;
}

export function saleSourceToBranchCode(source: string | null | undefined): string {
  return source === "online_shop" ? BRANCH_CODES.ONLINE : BRANCH_CODES.SHOP;
}

export function branchCodeToLegacyColumn(code: string): "shop_stock" | "online_shop_stock" | "production_stock" {
  if (code === BRANCH_CODES.ONLINE) return "online_shop_stock";
  if (code === BRANCH_CODES.PROD) return "production_stock";
  return "shop_stock";
}

/** Branch code -> legacy location/source_location string (transition compat). */
export function branchCodeToLocation(code: string): "production" | "shop" | "online_shop" {
  if (code === BRANCH_CODES.PROD) return "production";
  if (code === BRANCH_CODES.ONLINE) return "online_shop";
  return "shop";
}

/** Find the seeded branch ids (PROD/SHOP/ONLINE) from a branch list. */
export function seedBranchIds(branches: Pick<Branch, "id" | "code">[]): { prod: string; shop: string; online: string } {
  const byCode = (code: string) => branches.find((b) => b.code === code)?.id;
  const prod = byCode(BRANCH_CODES.PROD);
  const shop = byCode(BRANCH_CODES.SHOP);
  const online = byCode(BRANCH_CODES.ONLINE);
  if (!prod || !shop || !online) throw new Error("Seed branches (PROD/SHOP/ONLINE) are missing. Apply the loyalty normalization migration.");
  return { prod, shop, online };
}

export async function fetchBranches(activeOnly = true): Promise<Branch[]> {
  let q = supabase.from("branches").select("id, code, name, type, is_active").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Branch[]) || [];
}

/** product_id -> branch_id -> quantity, from the normalized table. */
export async function fetchStockMap(productIds: string[]): Promise<Map<string, Map<string, number>>> {
  const map = new Map<string, Map<string, number>>();
  if (!productIds.length) return map;
  const { data, error } = await supabase
    .from("product_stock_levels")
    .select("product_id, branch_id, quantity")
    .in("product_id", productIds);
  if (error) throw error;
  for (const row of (data as any[]) || []) {
    if (!map.has(row.product_id)) map.set(row.product_id, new Map());
    map.get(row.product_id)!.set(row.branch_id, Number(row.quantity));
  }
  return map;
}

/** Preferred read: normalized level row, else legacy product column fallback. */
export function getBranchQty(
  product: { id: string; shop_stock?: number; online_shop_stock?: number; production_stock?: number } | undefined,
  stockMap: Map<string, Map<string, number>>,
  branches: Pick<Branch, "id" | "code">[],
  productId: string,
  branchId: string,
): number {
  const hit = stockMap.get(productId)?.get(branchId);
  if (hit !== undefined) return hit;
  const branch = branches.find((b) => b.id === branchId);
  const col = branchCodeToLegacyColumn(branch?.code || BRANCH_CODES.SHOP);
  return Number((product as any)?.[col] ?? 0);
}

/** Write normalized level + mirror legacy column (transition dual-write). */
export async function setBranchQty(productId: string, branchId: string, branchCode: string, qty: number): Promise<void> {
  const { error } = await supabase
    .from("product_stock_levels")
    .upsert({ product_id: productId, branch_id: branchId, quantity: qty }, { onConflict: "product_id,branch_id" });
  if (error) throw error;
  const col = branchCodeToLegacyColumn(branchCode);
  const { error: legacyErr } = await supabase.from("products").update({ [col]: qty } as any).eq("id", productId);
  if (legacyErr) throw legacyErr;
}

export async function adjustBranchQty(
  productId: string,
  branchId: string,
  branchCode: string,
  delta: number,
  currentQty: number,
): Promise<number> {
  const next = currentQty + delta;
  if (next < 0) throw new Error(`Insufficient stock (have ${currentQty}, need ${-delta})`);
  await setBranchQty(productId, branchId, branchCode, next);
  return next;
}
