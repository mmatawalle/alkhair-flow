import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/stock-helpers";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv-export";

const presets = [
  { label: "Today", fn: () => { const d = new Date().toISOString().split("T")[0]; return [d, d]; } },
  { label: "This Week", fn: () => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const mon = new Date(d); mon.setDate(diff); return [mon.toISOString().split("T")[0], new Date().toISOString().split("T")[0]]; } },
  { label: "This Month", fn: () => { const d = new Date(); d.setDate(1); return [d.toISOString().split("T")[0], new Date().toISOString().split("T")[0]]; } },
];

export default function ProfitLoss() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: sales } = useQuery({
    queryKey: ["pl_sales", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_records").select("total_revenue, total_cogs, profit, voided, product_id, quantity_sold, products(name, bottle_size)").gte("sale_date", from).lte("sale_date", to);
      if (error) throw error;
      return data.filter(s => !s.voided);
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["pl_expenses", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_records").select("amount, category_code").gte("expense_date", from).lte("expense_date", to);
      if (error) throw error;
      return data;
    },
  });

  const { data: gifts } = useQuery({
    queryKey: ["pl_gifts", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_records").select("quantity, products(average_cost_per_unit, name, bottle_size)").gte("gift_date", from).lte("gift_date", to);
      if (error) throw error;
      return data;
    },
  });

  const totalRevenue = sales?.reduce((s, r) => s + Number(r.total_revenue), 0) || 0;
  const totalCOGS = sales?.reduce((s, r) => s + Number(r.total_cogs), 0) || 0;
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = expenses?.reduce((s, r) => s + Number(r.amount), 0) || 0;
  const totalGiftCost = gifts?.reduce((s, g: any) => s + Number(g.quantity) * Number(g.products?.average_cost_per_unit || 0), 0) || 0;
  const netProfit = grossProfit - totalExpenses - totalGiftCost;

  const expenseByCategory: Record<string, number> = {};
  expenses?.forEach(e => { expenseByCategory[e.category_code] = (expenseByCategory[e.category_code] || 0) + Number(e.amount); });

  // Product breakdown
  const productBreakdown = useMemo(() => {
    if (!sales?.length) return [];
    const map: Record<string, { name: string; qty: number; revenue: number; cogs: number; profit: number }> = {};
    sales.forEach((s: any) => {
      const id = s.product_id;
      const label = s.products ? `${s.products.name} (${s.products.bottle_size})` : id;
      if (!map[id]) map[id] = { name: label, qty: 0, revenue: 0, cogs: 0, profit: 0 };
      map[id].qty += Number(s.quantity_sold);
      map[id].revenue += Number(s.total_revenue);
      map[id].cogs += Number(s.total_cogs);
      map[id].profit += Number(s.profit);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-foreground">Profit & Loss</h2>
        <Button variant="outline" onClick={() => {
          const rows: (string | number)[][] = [
            ["Revenue", totalRevenue], ["COGS", totalCOGS], ["Gross Profit", grossProfit],
            ["Total Expenses", totalExpenses], ["Gift Costs", totalGiftCost], ["Net Profit", netProfit],
            [], ["--- Expenses by Category ---", ""],
            ...Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => [cat, amt]),
            [], ["--- Product Breakdown ---", ""],
            ["Product", "Qty", "Revenue", "COGS", "Profit"] as any,
            ...productBreakdown.map(p => [p.name, p.qty, p.revenue, p.cogs, p.profit]),
          ];
          downloadCSV(`profit-loss_${from}_${to}.csv`, ["Item", "Amount (₦)"], rows);
        }}><Download className="mr-2 h-4 w-4" />Export</Button>
      </div>

      {/* Time presets + custom */}
      <div className="flex flex-wrap items-end gap-2">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => { const [f, t] = p.fn(); setFrom(f); setTo(t); }}>
            {p.label}
          </Button>
        ))}
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-auto h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-auto h-8 text-sm" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue</CardTitle></CardHeader><CardContent><p className="text-xl md:text-2xl font-bold">{fmt(totalRevenue)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">COGS</CardTitle></CardHeader><CardContent><p className="text-xl md:text-2xl font-bold text-orange-600">{fmt(totalCOGS)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gross Profit</CardTitle></CardHeader><CardContent><p className={`text-xl md:text-2xl font-bold ${grossProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(grossProfit)}</p></CardContent></Card>
        <Card className={netProfit >= 0 ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle></CardHeader>
          <CardContent><p className={`text-xl md:text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(netProfit)}</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deductions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Expenses</span><span className="font-semibold">{fmt(totalExpenses)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Gift Costs</span><span className="font-semibold">{fmt(totalGiftCost)}</span></div>
            <hr />
            <div className="flex justify-between"><span className="font-medium">Total Deductions</span><span className="font-bold">{fmt(totalExpenses + totalGiftCost)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Expenses by Category</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between">
                <span className="capitalize text-muted-foreground">{cat}</span>
                <span className="font-medium">{fmt(amt)}</span>
              </div>
            ))}
            {Object.keys(expenseByCategory).length === 0 && <p className="text-muted-foreground text-sm">No expenses</p>}
          </CardContent>
        </Card>
      </div>

      {/* Product Breakdown */}
      {productBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Product Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty Sold</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>COGS</TableHead>
                    <TableHead>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productBreakdown.map(p => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.qty}</TableCell>
                      <TableCell>{fmt(p.revenue)}</TableCell>
                      <TableCell>{fmt(p.cogs)}</TableCell>
                      <TableCell className={p.profit >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(p.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Sales Count</span><span className="font-medium">{sales?.length || 0}</span></div>
          <div className="flex justify-between"><span>Total Revenue</span><span className="font-medium">{fmt(totalRevenue)}</span></div>
          <div className="flex justify-between"><span>– Cost of Goods Sold</span><span>{fmt(totalCOGS)}</span></div>
          <div className="flex justify-between"><span>= Gross Profit</span><span className="font-medium">{fmt(grossProfit)}</span></div>
          <div className="flex justify-between"><span>– Expenses</span><span>{fmt(totalExpenses)}</span></div>
          <div className="flex justify-between"><span>– Gift Costs</span><span>{fmt(totalGiftCost)}</span></div>
          <hr />
          <div className="flex justify-between text-base font-bold">
            <span>Net Profit</span>
            <span className={netProfit >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(netProfit)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
