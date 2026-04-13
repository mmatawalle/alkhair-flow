import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, DollarSign, TrendingUp, ArrowRightLeft, Plus, Truck, Receipt, Gift } from "lucide-react";
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
      const { data, error } = await supabase.from("sale_records").select("*, products(name, bottle_size)").eq("sale_date", today).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: todayTransfers } = useQuery({
    queryKey: ["transfer_records", "today"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_records").select("quantity_transferred").eq("transfer_date", today);
      if (error) throw error;
      return data;
    },
  });

  const { data: weekSales } = useQuery({
    queryKey: ["sale_records", "week"],
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const { data, error } = await supabase.from("sale_records").select("sale_date, total_revenue, profit, product_id, quantity_sold, products(name)").gte("sale_date", weekAgo.toISOString().split("T")[0]);
      if (error) throw error;
      return data;
    },
  });

  // KPIs
  const todayRevenue = todaySales?.reduce((s, r) => s + Number(r.total_revenue), 0) ?? 0;
  const todayProfit = todaySales?.reduce((s, r) => s + Number(r.profit), 0) ?? 0;
  const todayTransferQty = todayTransfers?.reduce((s, r) => s + Number(r.quantity_transferred), 0) ?? 0;

  // Low stock alerts
  const lowProducts = products?.filter(p => getProductStockLevel(Number(p.shop_stock)) !== "available") ?? [];
  const lowMaterials = rawMaterials?.filter(m => getStockLevel(Number(m.current_stock), Number(m.reorder_level)) !== "available") ?? [];
  const alertCount = lowProducts.length + lowMaterials.length;

  // Weekly chart data
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

  // Top selling product
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button size="lg" className="h-14 text-base gap-2" onClick={() => navigate("/sales", { state: { openDialog: true } })}>
          <Plus className="h-5 w-5" /> Record Sale
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-base gap-2 border-primary/30 hover:bg-primary/5" onClick={() => navigate("/transfers", { state: { openDialog: true } })}>
          <Truck className="h-5 w-5" /> Transfer Stock
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-base gap-2 border-primary/30 hover:bg-primary/5" onClick={() => navigate("/expenses", { state: { openDialog: true } })}>
          <Receipt className="h-5 w-5" /> Add Expense
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-base gap-2 border-primary/30 hover:bg-primary/5" onClick={() => navigate("/gifts", { state: { openDialog: true } })}>
          <Gift className="h-5 w-5" /> Add Gift
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(todayRevenue)}</div><p className="text-xs text-muted-foreground">{todaySales?.length ?? 0} sales today</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className={`text-2xl font-bold ${todayProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(todayProfit)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today Transfers</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{todayTransferQty} units</div></CardContent>
        </Card>
        <Card className={alertCount > 0 ? "border-destructive/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${alertCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent><div className={`text-2xl font-bold ${alertCount > 0 ? "text-destructive" : ""}`}>{alertCount}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Sales Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sales This Week</CardTitle>
            {topProduct && <p className="text-xs text-muted-foreground">Top seller: {topProduct.name} ({topProduct.qty} units)</p>}
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {weekChartData.map((_, i) => (
                      <Cell key={i} fill={i === weekChartData.length - 1 ? "hsl(160, 60%, 38%)" : "hsl(160, 40%, 70%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stock Alerts */}
        <Card>
          <CardHeader><CardTitle className="text-base">Stock Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {lowProducts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Finished Products</p>
                <div className="space-y-1.5">
                  {lowProducts.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{p.name} ({p.bottle_size})</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">Shop: {p.shop_stock} | Prod: {p.production_stock}</span>
                        <StockBadge level={getProductStockLevel(Number(p.shop_stock))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {lowMaterials.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Raw Materials</p>
                <div className="space-y-1.5">
                  {lowMaterials.map(m => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
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
            {alertCount === 0 && <p className="text-sm text-muted-foreground">All stock levels are good ✓</p>}
          </CardContent>
        </Card>

        {/* Product Stock */}
        <Card>
          <CardHeader><CardTitle className="text-base">Product Stock</CardTitle></CardHeader>
          <CardContent>
            {!products?.length ? (
              <p className="text-sm text-muted-foreground">No products yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name} ({p.bottle_size})</TableCell>
                      <TableCell>{p.production_stock}</TableCell>
                      <TableCell>{p.shop_stock}</TableCell>
                      <TableCell><StockBadge level={getProductStockLevel(Math.min(Number(p.shop_stock), Number(p.production_stock)))} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Today Sales Detail */}
        <Card>
          <CardHeader><CardTitle className="text-base">Today's Sales</CardTitle></CardHeader>
          <CardContent>
            {!todaySales?.length ? (
              <p className="text-sm text-muted-foreground">No sales today yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaySales.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.products?.name} ({s.products?.bottle_size})</TableCell>
                      <TableCell>{s.quantity_sold}</TableCell>
                      <TableCell>{fmt(s.total_revenue)}</TableCell>
                      <TableCell className={Number(s.profit) >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(s.profit)}</TableCell>
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
