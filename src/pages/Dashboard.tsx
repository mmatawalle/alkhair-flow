import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, DollarSign, TrendingUp, ArrowRightLeft, Plus, Truck, Receipt, Gift, Repeat } from "lucide-react";
import { StockBadge, getProductStockLevel, getStockLevel, fmt } from "@/lib/stock-helpers";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const today = new Date().toISOString().split("T")[0];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: todaySales } = useQuery({
    queryKey: ["sale_records", "today"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_records").select("*, products(name, bottle_size)").eq("sale_date", today).eq("voided", false).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: todayTransfers } = useQuery({
    queryKey: ["transfer_records", "today"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_records").select("quantity_transferred").eq("transfer_date", today).eq("voided", false);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingTransactions } = useQuery({
    queryKey: ["internal_transactions", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase.from("internal_transactions").select("*, products(name, bottle_size, average_cost_per_unit)").eq("status", "pending").eq("voided", false).order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: weekSales } = useQuery({
    queryKey: ["sale_records", "week"],
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const { data, error } = await supabase.from("sale_records").select("sale_date, total_revenue, profit, product_id, quantity_sold, products(name)").eq("voided", false).gte("sale_date", weekAgo.toISOString().split("T")[0]);
      if (error) throw error;
      return data;
    },
  });

  // KPIs
  const todayRevenue = todaySales?.reduce((s, r) => s + Number(r.total_revenue), 0) ?? 0;
  const todayProfit = todaySales?.reduce((s, r) => s + Number(r.profit), 0) ?? 0;
  const todayTransferQty = todayTransfers?.reduce((s, r) => s + Number(r.quantity_transferred), 0) ?? 0;

  const lowProducts = products?.filter(p => {
    const minStock = Math.min(Number(p.shop_stock), Number(p.online_shop_stock));
    return getProductStockLevel(minStock) !== "available";
  }) ?? [];
  const lowMaterials = rawMaterials?.filter(m => getStockLevel(Number(m.current_stock), Number(m.reorder_level)) !== "available") ?? [];
  const alertCount = lowProducts.length + lowMaterials.length;

  const weekChartData = (() => {
    if (!weekSales) return [];
    const map: Record<string, { date: string; revenue: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en", { weekday: "short" });
      map[ds] = { date: label, revenue: 0 };
    }
    weekSales.forEach(s => {
      if (map[s.sale_date]) map[s.sale_date].revenue += Number(s.total_revenue);
    });
    return Object.values(map);
  })();

  const topProduct = (() => {
    if (!weekSales?.length) return null;
    const counts: Record<string, { name: string; qty: number }> = {};
    weekSales.forEach((s: any) => {
      const id = s.product_id;
      if (!counts[id]) counts[id] = { name: s.products?.name || "?", qty: 0 };
      counts[id].qty += Number(s.quantity_sold);
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty)[0] || null;
  })();

  const owesSummary = (() => {
    if (!pendingTransactions?.length) return [];
    const map: Record<string, { name: string; productItems: number; productValue: number; cash: number }> = {};
    pendingTransactions.forEach((t: any) => {
      const name = t.taken_by || "Unknown";
      if (!map[name]) map[name] = { name, productItems: 0, productValue: 0, cash: 0 };
      if (t.transaction_type === "product") {
        map[name].productItems += Number(t.quantity);
        map[name].productValue += Number(t.quantity) * Number(t.products?.average_cost_per_unit || 0);
      } else {
        map[name].cash += Number(t.amount);
      }
    });
    return Object.values(map);
  })();

  const totalPendingValue = owesSummary.reduce((s, o) => s + o.productValue + o.cash, 0);

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Today's overview and quick actions</p>
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="border-dashed border-border/40 bg-card/50">
        <CardContent className="p-4 md:p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Button size="sm" className="h-10 text-sm gap-2" onClick={() => navigate("/sales", { state: { openDialog: true } })}>
              <Plus className="h-3.5 w-3.5" /> Sale
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-sm gap-2" onClick={() => navigate("/transfers", { state: { openDialog: true, destination: "shop" } })}>
              <Truck className="h-3.5 w-3.5" /> To Shop
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-sm gap-2" onClick={() => navigate("/transfers", { state: { openDialog: true, destination: "online_shop" } })}>
              <Truck className="h-3.5 w-3.5" /> To Online
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-sm gap-2" onClick={() => navigate("/expenses", { state: { openDialog: true } })}>
              <Receipt className="h-3.5 w-3.5" /> Expense
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-sm gap-2" onClick={() => navigate("/gifts", { state: { openDialog: true } })}>
              <Gift className="h-3.5 w-3.5" /> Gift
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-sm gap-2" onClick={() => navigate("/internal", { state: { openDialog: true } })}>
              <Repeat className="h-3.5 w-3.5" /> Internal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:gap-5 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today Sales</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{fmt(todayRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{todaySales?.length ?? 0} sales today</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today Profit</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${todayProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(todayProfit)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transfers</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{todayTransferQty} <span className="text-sm font-normal text-muted-foreground">units</span></div>
          </CardContent>
        </Card>

        <Card className={alertCount > 0 ? "border-destructive/20" : ""}>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alerts</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${alertCount > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
                <AlertTriangle className={`h-4 w-4 ${alertCount > 0 ? "text-destructive" : "text-primary"}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${alertCount > 0 ? "text-destructive" : ""}`}>{alertCount} <span className="text-sm font-normal text-muted-foreground">stock</span></div>
            {totalPendingValue > 0 && <p className="text-xs text-amber-600 font-medium mt-1">{fmt(totalPendingValue)} pending</p>}
          </CardContent>
        </Card>
      </div>

      {/* Charts & Performance */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales This Week</CardTitle>
            {topProduct && <p className="text-xs text-muted-foreground">Top seller: {topProduct.name} ({topProduct.qty} units)</p>}
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekChartData} barCategoryGap="20%">
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(25 12% 48%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(25 12% 48%)' }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v)} cursor={{ fill: 'hsl(36 18% 93% / 0.5)' }} contentStyle={{ borderRadius: '0.75rem', border: '1px solid hsl(36 18% 88%)', boxShadow: '0 4px 12px hsl(25 30% 14% / 0.06)' }} />
                  <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                    {weekChartData.map((_, i) => (
                      <Cell key={i} fill={i === weekChartData.length - 1 ? "hsl(40, 55%, 55%)" : "hsl(40, 55%, 55%, 0.25)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pending Internal</CardTitle>
              {totalPendingValue > 0 && <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">{fmt(totalPendingValue)}</span>}
            </div>
          </CardHeader>
          <CardContent>
            {owesSummary.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No pending transactions ✓
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owesSummary.map(o => (
                    <TableRow key={o.name}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell>{o.productItems > 0 ? `${o.productItems} items` : "—"}</TableCell>
                      <TableCell>{o.productValue > 0 ? fmt(o.productValue) : "—"}</TableCell>
                      <TableCell>{o.cash > 0 ? fmt(o.cash) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Data Section */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {lowProducts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Finished Products</p>
                <div className="space-y-2.5">
                  {lowProducts.map(p => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 py-1">
                      <span className="font-medium">{p.name} ({p.bottle_size})</span>
                      <div className="flex items-center gap-2 text-xs sm:text-sm">
                        <span className="text-muted-foreground">Shop: {p.shop_stock} | Online: {p.online_shop_stock} | Prod: {p.production_stock}</span>
                        <StockBadge level={getProductStockLevel(Math.min(Number(p.shop_stock), Number(p.online_shop_stock)))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {lowMaterials.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Raw Materials</p>
                <div className="space-y-2.5">
                  {lowMaterials.map(m => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-1">
                      <span className="font-medium">{m.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{m.current_stock} {m.usage_unit}</span>
                        <StockBadge level={getStockLevel(Number(m.current_stock), Number(m.reorder_level))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {alertCount === 0 && (
              <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                All stock levels are good ✓
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product Stock</CardTitle>
          </CardHeader>
          <CardContent>
            {!products?.length ? (
              <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">No products yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Online</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name} <span className="text-muted-foreground text-xs">({p.bottle_size})</span></TableCell>
                      <TableCell>{p.production_stock}</TableCell>
                      <TableCell>{p.shop_stock}</TableCell>
                      <TableCell>{p.online_shop_stock}</TableCell>
                      <TableCell><StockBadge level={getProductStockLevel(Math.min(Number(p.shop_stock), Number(p.online_shop_stock)))} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
