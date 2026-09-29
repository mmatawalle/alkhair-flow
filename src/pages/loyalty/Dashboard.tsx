// @ts-nocheck -- references tables not yet in generated DB types
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { fetchBranches } from "@/lib/inventory";

const DORMANT_DAYS = 60;

function monthsInRange(from: string, to: string): number {
  if (!from || !to) return 1;
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return Math.max(1, days / 30.44);
}

export default function LoyaltyDashboard() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [branchFilter, setBranchFilter] = useState("all");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });

  const { data: customers } = useQuery({
    queryKey: ["loyalty_customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_customers")
        .select("id, full_name, phone, status, created_at, area, age_range, gender");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["loyalty_sales_all", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, branch_id, customer_id, total, discount, member_discount, status, sale_date, branches(name)")
        .gte("sale_date", from)
        .lte("sale_date", to)
        .neq("status", "voided");
      if (error) throw error;
      return data as any[];
    },
  });

  // All-time attachment history (for repeat-all-time, last visit, dormant).
  const { data: history } = useQuery({
    queryKey: ["loyalty_sales_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("customer_id, sale_date, branch_id")
        .not("customer_id", "is", null)
        .neq("status", "voided")
        .order("sale_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ["loyalty_ledger_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_points_ledger").select("customer_id, branch_id, points, entry_type, created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // Product affinity: items of loyalty sales in range.
  const loyaltySaleIds = useMemo(
    () => ((sales || []).filter((s) => s.customer_id).map((s) => s.id) as string[]).slice(0, 500),
    [sales],
  );
  const { data: items } = useQuery({
    queryKey: ["loyalty_items", loyaltySaleIds.join(",").slice(0, 200)],
    queryFn: async () => {
      if (!loyaltySaleIds.length) return [] as any[];
      const { data, error } = await supabase
        .from("sale_items")
        .select("sale_id, quantity, line_total, product_id, products(name)")
        .in("sale_id", loyaltySaleIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: loyaltySaleIds.length > 0,
  });

  const inBranch = (branchId: string | null) => branchFilter === "all" || branchId === branchFilter;
  const inRange = (date: string) => date >= from && date <= to;

  const stats = useMemo(() => {
    const list = customers || [];
    const custById = new Map(list.map((c) => [c.id, c]));
    const newMembers = list.filter((c) => c.created_at?.slice(0, 10) >= from && c.created_at?.slice(0, 10) <= to).length;
    const active = list.filter((c) => c.status === "active").length;

    const rangeSales = (sales || []).filter((s) => inBranch(s.branch_id));
    const loyaltySales = rangeSales.filter((s) => s.customer_id);
    const loyaltyRevenue = loyaltySales.reduce((s, r) => s + Number(r.total), 0);
    const totalRevenue = rangeSales.reduce((s, r) => s + Number(r.total), 0);
    const memberDiscounts = loyaltySales.reduce((s, r) => s + Number(r.member_discount || 0), 0);

    const rangeLedger = (ledger || []).filter((e) => inBranch(e.branch_id) && inRange(e.created_at.slice(0, 10)));
    const issued = rangeLedger.filter((e) => e.entry_type === "earn").reduce((s, e) => s + Number(e.points), 0);
    const redeemed = -rangeLedger.filter((e) => e.entry_type === "redeem").reduce((s, e) => s + Number(e.points), 0);
    const outstanding = (ledger || []).reduce((s, e) => s + Number(e.points), 0);

    // Purchasers + repeat in range
    const visitsInRange = new Map<string, number>();
    const spendInRange = new Map<string, number>();
    for (const s of loyaltySales) {
      visitsInRange.set(s.customer_id, (visitsInRange.get(s.customer_id) || 0) + 1);
      spendInRange.set(s.customer_id, (spendInRange.get(s.customer_id) || 0) + Number(s.total));
    }
    const purchasers = visitsInRange.size;
    const repeatInRange = [...visitsInRange.values()].filter((v) => v > 1).length;
    const repeatPct = purchasers > 0 ? (repeatInRange / purchasers) * 100 : 0;

    // All-time visits + last purchase (branch-scoped when filtered)
    const allVisits = new Map<string, number>();
    const allSpend = new Map<string, number>();
    const lastVisit = new Map<string, string>();
    for (const h of (history || []).filter((x) => inBranch(x.branch_id))) {
      allVisits.set(h.customer_id, (allVisits.get(h.customer_id) || 0) + 1);
      if (!lastVisit.has(h.customer_id)) lastVisit.set(h.customer_id, h.sale_date);
    }
    for (const s of (sales || []).filter((x) => x.customer_id && inBranch(x.branch_id))) {
      // include in-range spend for rankings; all-time spend needs full history totals — use in-range + note
      void s;
    }
    // All-time spend proxy: use history? history lacks totals — fall back to in-range spend for rankings
    // but visits/last-visit are all-time. Rankings below use in-range spend + all-time visits.
    const nameOf = (id: string) => {
      const c = list.find((x) => x.id === id);
      return c ? `${c.full_name} (${c.phone})` : id.slice(0, 8);
    };
    const ranked = [...visitsInRange.entries()].map(([id, visits]) => ({
      id,
      name: nameOf(id),
      visits,
      spend: spendInRange.get(id) || 0,
      allTimeVisits: allVisits.get(id) || visits,
      last: lastVisit.get(id) || "—",
    }));
    const topSpenders = [...ranked].sort((a, b) => b.spend - a.spend).slice(0, 10);
    const mostFrequent = [...allVisits.entries()]
      .map(([id, visits]) => ({ id, name: nameOf(id), visits, spend: spendInRange.get(id) || 0, last: lastVisit.get(id) || "—" }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
    const repeatAllTime = [...allVisits.values()].filter((v) => v > 1).length;

    // Dormant: active members whose last visit is >60 days ago (or never attached)
    const todayStr = new Date().toISOString().split("T")[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DORMANT_DAYS);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const dormant = list
      .filter((c) => {
        if (branchFilter !== "all") {
          // only members seen at this branch (or never seen anywhere)
          const seenElsewhere = (history || []).some((h) => h.customer_id === c.id && h.branch_id !== branchFilter);
          const seenHere = (history || []).some((h) => h.customer_id === c.id && h.branch_id === branchFilter);
          if (seenElsewhere && !seenHere) return false;
        }
        const last = lastVisit.get(c.id);
        return !last || last < cutoffStr;
      })
      .map((c) => ({ ...c, last: lastVisit.get(c.id) || "never", visits: allVisits.get(c.id) || 0 }))
      .sort((a, b) => (a.last < b.last ? -1 : 1))
      .slice(0, 20);
    const dormantCount = list.filter((c) => {
      const last = lastVisit.get(c.id);
      return !last || last < cutoffStr;
    }).length;

    // Product affinity in range
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    const itemsBySale = new Map<string, string[]>();
    for (const i of items || []) {
      const name = i.products?.name || "Unknown";
      const cur = byProduct.get(i.product_id) || { name, qty: 0, revenue: 0 };
      cur.qty += Number(i.quantity);
      cur.revenue += Number(i.line_total);
      byProduct.set(i.product_id, cur);
      const arr = itemsBySale.get(i.sale_id) || [];
      arr.push(name);
      itemsBySale.set(i.sale_id, arr);
    }
    const topProducts = [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
    const pairCounts = new Map<string, number>();
    for (const names of itemsBySale.values()) {
      const uniq = [...new Set(names)].sort();
      for (let a = 0; a < uniq.length; a++) {
        for (let b = a + 1; b < uniq.length; b++) {
          const key = `${uniq[a]} + ${uniq[b]}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
    const topPairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Segmentation (consent-optional fields; only members with values)
    const seg = (get: (c: any) => string | null) => {
      const m = new Map<string, { members: Set<string>; revenue: number; visits: number }>();
      for (const c of list) {
        const key = get(c);
        if (!key) continue;
        const cur = m.get(key) || { members: new Set<string>(), revenue: 0, visits: 0 };
        cur.members.add(c.id);
        m.set(key, cur);
      }
      for (const [cid, rev] of spendInRange) {
        const c = custById.get(cid);
        const key = c ? get(c) : null;
        if (!key) continue;
        const cur = m.get(key);
        if (cur) {
          cur.revenue += rev;
          cur.visits += visitsInRange.get(cid) || 0;
        }
      }
      return [...m.entries()]
        .map(([key, v]) => ({ key, members: v.members.size, revenue: v.revenue, visits: v.visits }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);
    };
    const byArea = seg((c) => c.area || null);
    const byAge = seg((c) => c.age_range || null);

    const byBranch = new Map<string, { name: string; sales: number; revenue: number; points: number }>();
    for (const s of rangeSales) {
      const cur = byBranch.get(s.branch_id) || { name: s.branches?.name || "—", sales: 0, revenue: 0, points: 0 };
      cur.sales += 1;
      cur.revenue += Number(s.total);
      byBranch.set(s.branch_id, cur);
    }
    for (const e of rangeLedger.filter((x) => x.entry_type === "earn")) {
      const cur = byBranch.get(e.branch_id) || { name: "—", sales: 0, revenue: 0, points: 0 };
      cur.points += Number(e.points);
      byBranch.set(e.branch_id, cur);
    }

    const months = monthsInRange(from, to);
    const loyaltyPerMonth = loyaltyRevenue / months;
    const perMemberPerMonth = list.length > 0 ? loyaltyPerMonth / list.length : 0;

    return {
      total: list.length, newMembers, active, inactive: list.length - active,
      salesCount: rangeSales.length, loyaltySales: loyaltySales.length, loyaltyRevenue, totalRevenue,
      memberDiscounts,
      issued, redeemed, outstanding,
      redemptionRate: issued > 0 ? (redeemed / issued) * 100 : 0,
      attachRate: rangeSales.length > 0 ? (loyaltySales.length / rangeSales.length) * 100 : 0,
      purchasers, repeatInRange, repeatPct, repeatAllTime,
      topSpenders, mostFrequent, byBranch: [...byBranch.values()].sort((a, b) => b.revenue - a.revenue),
      dormant, dormantCount, todayStr,
      topProducts, topPairs,
      byArea, byAge,
      loyaltyPerMonth, perMemberPerMonth, months,
      allSpend,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, sales, history, ledger, items, from, to, branchFilter]);

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <h2 className="page-title">Loyalty Dashboard</h2>
      </div>

      <div className="filter-bar">
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground">Branch</label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => { setFrom(""); setTo(""); }}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Members" value={String(stats.total)} detail={`${stats.newMembers} new in range`} />
        <Kpi label="Purchased in period" value={String(stats.purchasers)} detail={`${stats.repeatPct.toFixed(0)}% repeat (${stats.repeatInRange})`} />
        <Kpi label="Loyalty sales" value={String(stats.loyaltySales)} detail={`${fmt(stats.loyaltyRevenue)} revenue`} />
        <Kpi label="Attach rate" value={`${stats.attachRate.toFixed(1)}%`} detail={`${stats.salesCount} total sales`} />
        <Kpi label="Member discounts" value={fmt(stats.memberDiscounts)} detail="5% benefit given in range" />
        <Kpi label="Revenue / month" value={fmt(Math.round(stats.loyaltyPerMonth))} detail={`${fmt(Math.round(stats.perMemberPerMonth))} per member/mo`} />
        <Kpi label={`Dormant (${DORMANT_DAYS}d+)`} value={String(stats.dormantCount)} detail="no purchase — win back" />
        <Kpi label="Repeat (all-time)" value={String(stats.repeatAllTime)} detail="2+ visits ever" />
        <Kpi label="Points issued" value={String(stats.issued)} detail="in range" />
        <Kpi label="Points redeemed" value={String(stats.redeemed)} detail={`${stats.redemptionRate.toFixed(1)}% redemption rate`} />
        <Kpi label="Outstanding" value={String(stats.outstanding)} detail="all-time liability" />
        <Kpi label="Active / Inactive" value={`${stats.active} / ${stats.inactive}`} detail="customer status" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Highest-Spending Customers (in period)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Visits</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topSpenders.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}<div className="text-[11px] text-muted-foreground font-normal">last {r.last} · {r.allTimeVisits} visits all-time</div></TableCell>
                    <TableCell>{r.visits}</TableCell>
                    <TableCell className="text-right">{fmt(r.spend)}</TableCell>
                  </TableRow>
                ))}
                {stats.topSpenders.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No loyalty sales yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Most Frequent Customers (all-time)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Visits</TableHead><TableHead className="text-right">Last</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.mostFrequent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.visits}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">{r.last}</TableCell>
                  </TableRow>
                ))}
                {stats.mostFrequent.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No loyalty sales yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">What members buy (in period)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topProducts.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.qty}</TableCell>
                    <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                  </TableRow>
                ))}
                {stats.topProducts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Attach sales to members to see favourites</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Often bought together</CardTitle>
            <p className="text-xs text-muted-foreground">e.g. “Oreo + samosa” regulars — use for combos &amp; upsell.</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Pair</TableHead><TableHead className="text-right">Baskets</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topPairs.map(([pair, n]) => (
                  <TableRow key={pair}>
                    <TableCell className="font-medium">{pair}</TableCell>
                    <TableCell className="text-right">{n}</TableCell>
                  </TableRow>
                ))}
                {stats.topPairs.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Need 2+ multi-item baskets in period</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dormant members — haven’t returned in {DORMANT_DAYS} days</CardTitle>
          <p className="text-xs text-muted-foreground">Win-back list: message or offer a return incentive (as of {stats.todayStr}).</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Visits</TableHead><TableHead>Last purchase</TableHead></TableRow></TableHeader>
            <TableBody>
              {stats.dormant.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.full_name} <span className="text-muted-foreground text-xs font-normal">({c.phone})</span></TableCell>
                  <TableCell>{c.visits}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.last}</TableCell>
                </TableRow>
              ))}
              {stats.dormant.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nobody dormant — great retention</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(stats.byArea.length > 0 || stats.byAge.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.byArea.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by area</CardTitle>
                <p className="text-xs text-muted-foreground">Only members who shared a location.</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Area</TableHead><TableHead>Members</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stats.byArea.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{r.key}</TableCell>
                        <TableCell>{r.members}</TableCell>
                        <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {stats.byAge.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by age range</CardTitle>
                <p className="text-xs text-muted-foreground">Only members who shared an age range.</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Age</TableHead><TableHead>Members</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {stats.byAge.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{r.key}</TableCell>
                        <TableCell>{r.members}</TableCell>
                        <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Performance by Branch</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Branch</TableHead><TableHead>Sales</TableHead><TableHead>Revenue</TableHead><TableHead>Points Issued</TableHead></TableRow></TableHeader>
            <TableBody>
              {stats.byBranch.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.sales}</TableCell>
                  <TableCell>{fmt(b.revenue)}</TableCell>
                  <TableCell>{b.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="bg-card/95">
      <CardContent className="p-3 md:p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:text-xs">{label}</p>
        <p className="mt-1 text-xl font-semibold md:text-2xl">{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground md:text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
