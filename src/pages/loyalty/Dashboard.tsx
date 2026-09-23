import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { fetchBranches } from "@/lib/inventory";

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
      const { data, error } = await supabase.from("loyalty_customers").select("id, full_name, phone, status, created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["loyalty_sales_all", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, branch_id, customer_id, total, status, sale_date, branches(name)")
        .gte("sale_date", from)
        .lte("sale_date", to)
        .neq("status", "voided");
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

  const inBranch = (branchId: string | null) => branchFilter === "all" || branchId === branchFilter;
  const inRange = (date: string) => date >= from && date <= to;

  const stats = useMemo(() => {
    const list = customers || [];
    const newMembers = list.filter((c) => c.created_at?.slice(0, 10) >= from && c.created_at?.slice(0, 10) <= to).length;
    const active = list.filter((c) => c.status === "active").length;

    const rangeSales = (sales || []).filter((s) => inBranch(s.branch_id));
    const loyaltySales = rangeSales.filter((s) => s.customer_id);
    const loyaltyRevenue = loyaltySales.reduce((s, r) => s + Number(r.total), 0);
    const totalRevenue = rangeSales.reduce((s, r) => s + Number(r.total), 0);

    const rangeLedger = (ledger || []).filter((e) => inBranch(e.branch_id) && inRange(e.created_at.slice(0, 10)));
    const issued = rangeLedger.filter((e) => e.entry_type === "earn").reduce((s, e) => s + Number(e.points), 0);
    const redeemed = -rangeLedger.filter((e) => e.entry_type === "redeem").reduce((s, e) => s + Number(e.points), 0);
    const outstanding = (ledger || []).reduce((s, e) => s + Number(e.points), 0);

    // Repeat customers + rankings (all-time, branch-scoped)
    const byCustomer = new Map<string, { spend: number; visits: number }>();
    for (const s of (sales || []).filter((x) => x.customer_id && inBranch(x.branch_id))) {
      const cur = byCustomer.get(s.customer_id) || { spend: 0, visits: 0 };
      cur.spend += Number(s.total);
      cur.visits += 1;
      byCustomer.set(s.customer_id, cur);
    }
    const nameOf = (id: string) => {
      const c = list.find((x) => x.id === id);
      return c ? `${c.full_name} (${c.phone})` : id.slice(0, 8);
    };
    const ranked = [...byCustomer.entries()].map(([id, v]) => ({ id, name: nameOf(id), ...v }));
    const topSpenders = [...ranked].sort((a, b) => b.spend - a.spend).slice(0, 10);
    const mostFrequent = [...ranked].sort((a, b) => b.visits - a.visits).slice(0, 10);
    const repeat = ranked.filter((r) => r.visits > 1).length;

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

    return {
      total: list.length, newMembers, active, inactive: list.length - active,
      salesCount: rangeSales.length, loyaltySales: loyaltySales.length, loyaltyRevenue, totalRevenue,
      issued, redeemed, outstanding,
      redemptionRate: issued > 0 ? (redeemed / issued) * 100 : 0,
      attachRate: rangeSales.length > 0 ? (loyaltySales.length / rangeSales.length) * 100 : 0,
      repeat, topSpenders, mostFrequent, byBranch: [...byBranch.values()].sort((a, b) => b.revenue - a.revenue),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, sales, ledger, from, to, branchFilter]);

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
        <Kpi label="Active / Inactive" value={`${stats.active} / ${stats.inactive}`} detail="customer status" />
        <Kpi label="Loyalty sales" value={String(stats.loyaltySales)} detail={`${fmt(stats.loyaltyRevenue)} revenue`} />
        <Kpi label="Attach rate" value={`${stats.attachRate.toFixed(1)}%`} detail={`${stats.salesCount} total sales`} />
        <Kpi label="Points issued" value={String(stats.issued)} detail="in range" />
        <Kpi label="Points redeemed" value={String(stats.redeemed)} detail={`${stats.redemptionRate.toFixed(1)}% redemption rate`} />
        <Kpi label="Outstanding" value={String(stats.outstanding)} detail="all-time liability" />
        <Kpi label="Repeat customers" value={String(stats.repeat)} detail="2+ visits" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Highest-Spending Customers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Visits</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topSpenders.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
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
          <CardHeader><CardTitle className="text-base">Most Frequent Customers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Visits</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.mostFrequent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.visits}</TableCell>
                    <TableCell className="text-right">{fmt(r.spend)}</TableCell>
                  </TableRow>
                ))}
                {stats.mostFrequent.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No loyalty sales yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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
