import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { calculateEarnPoints, calculateMemberDiscount, fetchActiveRule, fetchExclusions, fetchBalance, getActiveCampaignMultiplier, postLedgerEntry } from "@/lib/loyalty";
import { adjustBranchQty, fetchStockMap } from "@/lib/inventory";
import { sendLoyaltyEarnedEmail, sendLoyaltyRedeemedEmail } from "@/lib/email";

export interface SaleLineInput {
  product_id: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

export interface CreateSaleInput {
  branch_id: string;
  branch_code: string;
  customer_id?: string | null;
  sale_type: string;
  sale_date: string;
  note?: string | null;
  items: SaleLineInput[];
  redeem_reward_id?: string | null;
  apply_member_discount?: boolean | null;
  pos_terminal_id?: string | null;
  bank_account_id?: string | null;
}

function saleNumber(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `S-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${rand}`;
}

/** Normalized sale: sales header + sale_items + branch stock + loyalty earn/redeem + audit. */
export async function createSale(input: CreateSaleInput): Promise<{ saleId: string; pointsEarned: number; discount: number; memberDiscount: number }> {
  const valid = input.items.filter((i) => i.product_id && Number(i.quantity) > 0 && Number(i.unit_price) >= 0);
  if (!valid.length) throw new Error("Add at least one sale item");
  if (!input.branch_id) throw new Error("Select a branch");
  if (input.sale_type === "pos" && !input.pos_terminal_id) throw new Error("Select a POS terminal for POS sales");
  if (input.sale_type === "transfer" && !input.bank_account_id) throw new Error("Select a bank account for transfer sales");

  // Stock check (normalized levels)
  const stockMap = await fetchStockMap(valid.map((i) => i.product_id));
  const needed = new Map<string, number>();
  for (const i of valid) needed.set(i.product_id, (needed.get(i.product_id) || 0) + Number(i.quantity));
  for (const [pid, qty] of needed) {
    const have = Number(stockMap.get(pid)?.get(input.branch_id) ?? 0);
    if (qty > have) {
      const { data: p } = await supabase.from("products").select("name").eq("id", pid).single();
      throw new Error(`Not enough stock for ${(p as any)?.name || "product"}. Available: ${have}, needed: ${qty}`);
    }
  }

  const lines = valid.map((i) => {
    const qty = Number(i.quantity);
    const price = Number(i.unit_price);
    const cost = Number(i.unit_cost || 0);
    const total = qty * price;
    const cogs = qty * cost;
    return { ...i, line_total: total, line_cogs: cogs, line_profit: total - cogs };
  });
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  // Member benefit: automatic % off for attached loyalty customers (default 5%).
  let memberDiscount = 0;
  let memberPct = 0;
  if (input.customer_id && input.apply_member_discount !== false) {
    try {
      const rule = await fetchActiveRule();
      memberPct = Number((rule as any)?.member_discount_percent || 0);
      memberDiscount = calculateMemberDiscount(subtotal, memberPct);
    } catch {
      memberDiscount = 0;
    }
  }
  // Pre-validate redeem (balance + reward active) and compute discount before sale insert
  let discount = 0;
  let redeemReward: any = null;
  if (input.redeem_reward_id && input.customer_id) {
    const { data: rw, error: rwErr } = await supabase.from("loyalty_rewards").select("*").eq("id", input.redeem_reward_id).single();
    if (rwErr) throw rwErr;
    if (!(rw as any).is_active) throw new Error("Reward is not active");
    const { data: balRows, error: bErr } = await supabase.from("loyalty_points_ledger").select("points").eq("customer_id", input.customer_id);
    if (bErr) throw bErr;
    const bal = (balRows as any[]).reduce((s, r) => s + Number(r.points), 0);
    if (bal < Number((rw as any).points_cost)) throw new Error(`Insufficient points (have ${bal}, need ${(rw as any).points_cost})`);
    redeemReward = rw;
    if ((rw as any).reward_type === "discount") discount = Number((rw as any).value_amount || 0);
    else if ((rw as any).reward_type === "free_product" && (rw as any).product_id) {
      const { data: p } = await supabase.from("products").select("selling_price").eq("id", (rw as any).product_id).single();
      discount = Number((rw as any).value_amount || (p as any)?.selling_price || 0);
    } else discount = Number((rw as any).value_amount || 0);
    const remainder = Math.max(0, subtotal - memberDiscount);
    if (discount > remainder) discount = remainder;
  }
  const totalDiscount = memberDiscount + discount;
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .insert({
      sale_number: saleNumber(),
      branch_id: input.branch_id,
      customer_id: input.customer_id || null,
      cashier_id: user?.id || null,
      sale_date: input.sale_date,
      sale_type: input.sale_type,
      pos_terminal_id: input.pos_terminal_id || null,
      bank_account_id: input.bank_account_id || null,
      subtotal,
      discount: totalDiscount,
      member_discount: memberDiscount,
      total: subtotal - totalDiscount,
      status: "completed",
      note: input.note || null,
    })
    .select("id")
    .single();
  if (saleErr) throw saleErr;

  const { error: itemsErr } = await supabase.from("sale_items").insert(
    lines.map((l) => ({
      sale_id: (sale as any).id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      unit_cost: l.unit_cost,
      line_cogs: l.line_cogs,
      line_profit: l.line_profit,
    })),
  );
  if (itemsErr) throw itemsErr;

  // Decrement branch stock (dual-writes legacy columns in inventory lib)
  const remaining = new Map<string, number>();
  for (const [pid] of needed) remaining.set(pid, Number(stockMap.get(pid)?.get(input.branch_id) ?? 0));
  for (const l of lines) {
    const cur = remaining.get(l.product_id)!;
    const next = await adjustBranchQty(l.product_id, input.branch_id, input.branch_code, -Number(l.quantity), cur);
    remaining.set(l.product_id, next);
  }

  // Loyalty redeem (linked to sale) — creates redemption + redeem ledger entry
  if (redeemReward && input.customer_id) {
    const { error: redErr } = await supabase.from("loyalty_redemptions").insert({
      customer_id: input.customer_id,
      reward_id: redeemReward.id,
      points_spent: redeemReward.points_cost,
      sale_id: (sale as any).id,
      branch_id: input.branch_id,
      cashier_id: user?.id || null,
      status: "completed",
    });
    if (redErr) throw redErr;
    await postLedgerEntry({
      customer_id: input.customer_id,
      points: -Number(redeemReward.points_cost),
      entry_type: "redeem",
      reason: `Redeemed at POS: ${redeemReward.name} (${(sale as any).id.slice(0, 8)}${memberDiscount > 0 ? `, member -₦${memberDiscount}` : ""}${discount > 0 ? `, reward -₦${discount}` : ""})`,
      sale_id: (sale as any).id,
      branch_id: input.branch_id,
    });
    // Email redeem (non-blocking)
    void (async () => {
      const { data: cust } = await supabase.from("loyalty_customers").select("full_name, email").eq("id", input.customer_id!).single();
      if (cust?.email) {
        const bal = await fetchBalance(input.customer_id!);
        void sendLoyaltyRedeemedEmail({
          to: cust.email,
          name: cust.full_name,
          rewardName: redeemReward.name,
          pointsSpent: Number(redeemReward.points_cost),
          totalBalance: bal,
          discountText: discount > 0 ? `₦${discount} off` : undefined,
        });
      }
    })();
    // If free product, deduct stock and add zero-price sale_item
    if (redeemReward.reward_type === "free_product" && redeemReward.product_id) {
      const map = await fetchStockMap([redeemReward.product_id]);
      const cur = Number(map.get(redeemReward.product_id)?.get(input.branch_id) ?? 0);
      if (cur > 0) {
        const prodRes = await supabase.from("products").select("average_cost_per_unit").eq("id", redeemReward.product_id).single();
        const cogs = Number((prodRes.data as any)?.average_cost_per_unit || 0);
        await supabase.from("sale_items").insert({
          sale_id: (sale as any).id,
          product_id: redeemReward.product_id,
          quantity: 1,
          unit_price: 0,
          line_total: 0,
          unit_cost: cogs,
          line_cogs: cogs,
          line_profit: -cogs,
        });
        await adjustBranchQty(redeemReward.product_id, input.branch_id, input.branch_code, -1, cur);
      }
    }
  }

  // Loyalty earn (with campaign multiplier), on net payable after member + redeem discounts
  let pointsEarned = 0;
  if (input.customer_id) {
    try {
      const [rule, excl] = await Promise.all([fetchActiveRule(), fetchExclusions()]);
      if (rule) {
        const earnLines = lines.map((l) => ({ product_id: l.product_id, category: l.category, line_total: l.line_total }));
        const multiplier = await getActiveCampaignMultiplier(input.sale_date, earnLines);
        const { eligibleTotal, points: grossPoints } = calculateEarnPoints(earnLines, rule, excl.products, excl.categories, 1);
        if (grossPoints > 0) {
          // Scale eligible spend down pro-rata for discounts, then apply multiplier.
          const ratio = subtotal > 0 ? Math.max(0, (subtotal - totalDiscount) / subtotal) : 0;
          const netEligible = eligibleTotal * ratio;
          const perPoint = Number((rule as any).amount_per_point || 0);
          const netPoints = perPoint > 0 && netEligible >= Number((rule as any).min_spend || 0)
            ? Math.floor(netEligible / perPoint) * multiplier
            : 0;
          const points = netPoints;
          if (points > 0) {
          await postLedgerEntry({
            customer_id: input.customer_id,
            points,
            entry_type: "earn",
            reason: `Earn on sale ${(sale as any).id.slice(0, 8)}${multiplier > 1 ? ` ×${multiplier}` : ""}`,
            sale_id: (sale as any).id,
            branch_id: input.branch_id,
          });
          pointsEarned = points;
          // Email earned (non-blocking) — fetch balance after insert + branch name
          void (async () => {
            const [{ data: cust }, { data: br }] = await Promise.all([
              supabase.from("loyalty_customers").select("full_name, email").eq("id", input.customer_id!).single(),
              supabase.from("branches").select("name").eq("id", input.branch_id).single(),
            ]);
            if (cust?.email) {
              const bal = await fetchBalance(input.customer_id!);
              void sendLoyaltyEarnedEmail({
                to: cust.email,
                name: cust.full_name,
                points,
                totalBalance: bal,
                saleNumber: (sale as any).id.slice(0, 8).toUpperCase(),
                branchName: (br as any)?.name,
              });
            }
          })();
          }
        }
      }
    } catch (e) {
      console.error("Loyalty earn failed (sale kept):", e);
    }
  }

  await logAudit({
    action_type: "create",
    module: "sales",
    record_id: (sale as any).id,
    new_values: { branch_id: input.branch_id, customer_id: input.customer_id, total: subtotal - totalDiscount, discount: totalDiscount, member_discount: memberDiscount, redeem_discount: discount, lines: lines.length, redeemed: redeemReward?.name || null, sale_type: input.sale_type, pos_terminal_id: input.pos_terminal_id || null, bank_account_id: input.bank_account_id || null },
  });

  return { saleId: (sale as any).id, pointsEarned, discount: totalDiscount, memberDiscount };
}

/** Void a normalized sale: restore stock, reverse loyalty earn, audit. */
export async function voidSale(saleId: string): Promise<void> {
  const { data: sale, error: sErr } = await supabase.from("sales").select("id, branch_id, customer_id, status").eq("id", saleId).single();
  if (sErr) throw sErr;
  if ((sale as any).status === "voided") throw new Error("Sale already voided");

  const { data: items, error: iErr } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", saleId);
  if (iErr) throw iErr;

  const { data: branches } = await supabase.from("branches").select("id, code").eq("id", (sale as any).branch_id).limit(1);
  const branchCode = (branches as any[])?.[0]?.code || "SHOP";

  const stockMap = await fetchStockMap(((items as any[]) || []).map((i) => i.product_id));
  for (const it of (items as any[]) || []) {
    const cur = Number(stockMap.get(it.product_id)?.get((sale as any).branch_id) ?? 0);
    await adjustBranchQty(it.product_id, (sale as any).branch_id, branchCode, Number(it.quantity), cur);
  }

  const { error: vErr } = await supabase.from("sales").update({ status: "voided" }).eq("id", saleId);
  if (vErr) throw vErr;

  if ((sale as any).customer_id) {
    const { data: earns } = await supabase
      .from("loyalty_points_ledger")
      .select("points")
      .eq("sale_id", saleId)
      .eq("entry_type", "earn");
    const earned = ((earns as any[]) || []).reduce((s, e) => s + Number(e.points), 0);
    if (earned > 0) {
      await postLedgerEntry({
        customer_id: (sale as any).customer_id,
        points: -earned,
        entry_type: "void",
        reason: "Sale voided — points reversed",
        sale_id: saleId,
        branch_id: (sale as any).branch_id,
      });
    }
    // Reverse any redemption tied to this sale
    const { data: reds } = await supabase.from("loyalty_redemptions").select("id, points_spent").eq("sale_id", saleId).eq("status", "completed");
    for (const r of (reds as any[]) || []) {
      await postLedgerEntry({
        customer_id: (sale as any).customer_id,
        points: Number(r.points_spent),
        entry_type: "void",
        reason: "Redemption voided — sale voided",
        sale_id: saleId,
        branch_id: (sale as any).branch_id,
      });
      await supabase.from("loyalty_redemptions").update({ status: "voided" }).eq("id", r.id);
    }
  }

  await logAudit({ action_type: "void", module: "sales", record_id: saleId, note: "Sale voided, stock restored" });
}
