import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowRightLeft, DollarSign, Gift, Plus, Receipt, Repeat, TrendingUp, Truck } from "lucide-react";
import { StockBadge, getProductStockLevel, getStockLevel, fmt } from "@/lib/stock-helpers";
import { fetchBranches, fetchStockMap } from "@/lib/inventory";
import type { Database } from "@/integrations/supabase/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const today = new Date().toISOString().split("T")[0];

type Product = Database["public"]["Tables"]["products"]["Row"];
type RawMaterial = Database["public"]["Tables"]["raw_materials"]["Row"];
type InternalTransaction = Database["public"]["Tables"]["internal_transactions"]["Row"];

type InternalWithProduct = InternalTransaction & {
  products: Pick<Product, "name" | "bottle_size" | "average_cost_per_unit"> | null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data as RawMaterial[];
    },
  });

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });
  const productIds = (products || []).map((p) => (p as any).id);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const { data: todaySales } = useQuery({
    queryKey: ["sales", "today"],
    queryFn: async () => {
      // Prefer normalized sales; fallback to legacy sale_records if migration not yet applied or empty
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, total, status, created_at, sale_items(quantity, line_profit, line_total, products(name, bottle_size))")
        .eq("sale_date", today)
        .neq("status", "voided")
        .order("created_at", { ascending: false });
      if (sErr) throw sErr;
      if ((sales as any[])?.length) return sales as any[];
      const { data: legacy, error: lErr } = await supabase
        .from("sale_records")
        .select("*, products(name, bottle_size)")
        .eq("sale_date", today)
        .eq("voided", false)
        .order("created_at", { ascending: false });
      if (lErr) throw lErr;
      return (legacy as any[]) || [];
    },
  });

  const { data: todayTransfers } = useQuery({
    queryKey: ["transfer_records", "today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_records")
        .select("quantity_transferred")
        .eq("transfer_date", today)
        .eq("voided", false);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingTransactions } = useQuery({
    queryKey: ["internal_transactions", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_transactions")
        .select("*, products(name, bottle_size, average_cost_per_unit)")
        .eq("status", "pending")
        .eq("voided", false)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as InternalWithProduct[];
    },
  });

  const { data: weekSales } = useQuery({
    queryKey: ["sales", "week"],
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("sale_date, sale_items(quantity, line_total, line_profit, product_id, products(name))")
        .neq("status", "voided")
        .gte("sale_date", weekAgo.toISOString().split("T")[0]);
      if (!sErr && (sales as any[])?.length) return sales as any[];
      const { data: legacy, error: lErr } = await supabase
        .from("sale_records")
        .select("sale_date, total_revenue, profit, product_id, quantity_sold, products(name)")
        .eq("voided", false)
        .gte("sale_date", weekAgo.toISOString().split("T")[0]);
      if (lErr) throw lErr;
      return legacy as any[];
    },
  });

  const todayRevenue = (() => {
    if (!todaySales?.length) return 0;
    const first: any = todaySales[0];
    if (first.total !== undefined) return (todaySales as any[]).reduce((s, r) => s + Number(r.total), 0);
    return (todaySales as any[]).reduce((s, r) => s + Number(r.total_revenue || 0), 0);
  })();
  const todayProfit = (() => {
    if (!todaySales?.length) return 0;
    const first: any = todaySales[0];
    if (first.sale_items) {
      return (todaySales as any[]).reduce((s, sale) => s + ((sale.sale_items as any[]) || []).reduce((a, it) => a + Number(it.line_profit || 0), 0), 0);
    }
    return (todaySales as any[]).reduce((s, r) => s + Number(r.profit || 0), 0);
  })();
  const todayTransferQty = todayTransfers?.reduce((s, r) => s + Number(r.quantity_transferred), 0) ?? 0;

  const lowProducts = (() => {
    if (!products?.length) return [] as any[];
    if (!stockMap || !(branches || []).length) {
      return products.filter((p: any) => {
        const minStock = Math.min(Number(p.shop_stock), Number(p.online_shop_stock));
        return getProductStockLevel(minStock) !== "available";
      });
    }
    const shop = (branches as any[]).find((b) => b.code === "SHOP")?.id;
    const online = (branches as any[]).find((b) => b.code === "ONLINE")?.id;
    return (products as any[]).filter((p: any) => {
      const s = Number(stockMap.get(p.id)?.get(shop) ?? p.shop_stock);
      const o = Number(stockMap.get(p.id)?.get(online) ?? p.online_shop_stock);
      return getProductStockLevel(Math.min(s, o)) !== "available";
    });
  })();
  const lowMaterials = rawMaterials?.filter(m => getStockLevel(Number(m.current_stock), Number(m.reorder_level)) !== "available") ?? [];
  const alertCount = lowProducts.length + lowMaterials.length;

  const weekChartData = (() => {
    if (!weekSales) return [];
    const map: Record<string, { date: string; revenue: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      map[ds] = { date: d.toLocaleDateString("en", { weekday: "short" }), revenue: 0 };
    }
    const isNormalized = !!(weekSales as any[])[0]?.sale_items;
    if (isNormalized) {
      (weekSales as any[]).forEach((sale: any) => {
        if (map[sale.sale_date]) {
          const rev = ((sale.sale_items as any[]) || []).reduce((s, it) => s + Number(it.line_total || 0), 0);
          map[sale.sale_date].revenue += rev;
        }
      });
    } else {
      (weekSales as any[]).forEach((s: any) => {
        if (map[s.sale_date]) map[s.sale_date].revenue += Number(s.total_revenue || 0);
      });
    }
    return Object.values(map);
  })();

  const topProduct = (() => {
    if (!weekSales?.length) return null;
    const counts: Record<string, { name: string; qty: number }> = {};
    const isNormalized = !!(weekSales as any[])[0]?.sale_items;
    if (isNormalized) {
      (weekSales as any[]).forEach((sale: any) => {
        ((sale.sale_items as any[]) || []).forEach((it: any) => {
          const id = it.product_id;
          if (!counts[id]) counts[id] = { name: it.products?.name || "Unknown", qty: 0 };
          counts[id].qty += Number(it.quantity || 0);
        });
      });
    } else {
      (weekSales as any[]).forEach((s: any) => {
        const id = s.product_id;
        if (!counts[id]) counts[id] = { name: s.products?.name || "Unknown", qty: 0 };
        counts[id].qty += Number(s.quantity_sold || 0);
      });
    }
    return Object.values(counts).sort((a, b) => b.qty - a.qty)[0] || null;
  })();

  const owesSummary = (() => {
    if (!pendingTransactions?.length) return [];
    const map: Record<string, { name: string; productItems: number; productValue: number; cash: number }> = {};
    pendingTransactions.forEach((t: InternalWithProduct) => {
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

  const allQuickActions = [
    { label: "Record sale", icon: Plus, variant: "default" as const, onClick: () => navigate("/sales", { state: { openDialog: true } }), adminOnly: false },
    { label: "Move to shop", icon: Truck, variant: "outline" as const, onClick: () => navigate("/transfers", { state: { openDialog: true, destination: "shop" } }), adminOnly: true },
    { label: "Move online", icon: Truck, variant: "outline" as const, onClick: () => navigate("/transfers", { state: { openDialog: true, destination: "online_shop" } }), adminOnly: true },
    { label: "Add expense", icon: Receipt, variant: "outline" as const, onClick: () => navigate("/expenses", { state: { openDialog: true } }), adminOnly: true },
    { label: "Gift item", icon: Gift, variant: "outline" as const, onClick: () => navigate("/gifts", { state: { openDialog: true } }), adminOnly: true },
    { label: "Internal use", icon: Repeat, variant: "outline" as const, onClick: () => navigate("/internal", { state: { openDialog: true } }), adminOnly: true },
  ];
  const quickActions = allQuickActions.filter((a) => !a.adminOnly || isAdmin);
  const [primaryAction, ...secondaryActions] = quickActions;

  return (
    <div className="page-container space-y-3 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl md:text-2xl">AL-KHAIR DRINKS & SNACKS DASHBOARD</h2>
          <p className="mt-0.5 max-w-[220px] text-xs text-muted-foreground sm:max-w-none sm:text-sm">
            Today&apos;s sales, stock, and daily work.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-9 shrink-0 bg-card/80 px-3 md:h-10 md:px-4" onClick={() => navigate("/profit-loss")}>
            View report
          </Button>
        )}
      </div>

      {quickActions.length > 0 && primaryAction && (
        <Card className="bg-card/95">
          <CardContent className="space-y-3 p-3 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Quick actions</p>
              <span className="hidden text-xs text-muted-foreground sm:inline">Daily shortcuts</span>
            </div>
            <Button
              variant={primaryAction.variant}
              className="h-11 w-full justify-start px-3 shadow-none md:hidden"
              onClick={primaryAction.onClick}
            >
              <primaryAction.icon className="h-4 w-4" />
              {primaryAction.label}
            </Button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Button
                variant={primaryAction.variant}
                className="hidden h-10 min-w-0 justify-start px-3 text-sm shadow-none md:inline-flex"
                onClick={primaryAction.onClick}
              >
                <primaryAction.icon className="h-4 w-4" />
                <span className="truncate">{primaryAction.label}</span>
              </Button>
              {(secondaryActions).map(action => (
              <Button
                key={action.label}
                variant={action.variant}
                className="h-10 min-w-0 justify-start bg-card/80 px-2 text-xs shadow-none sm:px-3 sm:text-sm"
                onClick={action.onClick}
              >
                <action.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="truncate">{action.label}</span>
              </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
        <MetricCard
          label="Sales today"
          value={fmt(todayRevenue)}
          detail={`${todaySales?.length ?? 0} completed sales`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          label="Profit today"
          value={fmt(todayProfit)}
          detail={todayProfit >= 0 ? "Positive margin" : "Below cost"}
          tone={todayProfit >= 0 ? "success" : "danger"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          label="Transfers today"
          value={`${todayTransferQty}`}
          detail="Units moved"
          icon={<ArrowRightLeft className="h-4 w-4" />}
        />
        <MetricCard
          label="Attention"
          value={`${alertCount}`}
          detail={totalPendingValue > 0 ? `${fmt(totalPendingValue)} pending internal` : "Stock alerts"}
          tone={alertCount > 0 ? "danger" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-3 md:gap-5 xl:grid-cols-[1.45fr_0.8fr]">
        <Card className="order-2 overflow-hidden bg-card/95 xl:order-1">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-border/70 bg-muted/25">
            <div>
              <CardTitle>Sales trend</CardTitle>
              {topProduct && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Top seller: {topProduct.name}, {topProduct.qty} units
                </p>
              )}
            </div>
            <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">7 days</span>
          </CardHeader>
          <CardContent className="grid gap-3 p-3 md:grid-cols-[1fr_180px] md:gap-4 md:p-5">
            <div className="h-48 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekChartData} barCategoryGap="22%">
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    cursor={{ fill: "hsl(var(--muted) / 0.7)" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "0 12px 28px hsl(30 18% 12% / 0.12)",
                    }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {weekChartData.map((_, i) => (
                      <Cell key={i} fill={i === weekChartData.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.28)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
              <MiniStat label="Revenue" value={fmt(todayRevenue)} />
              <MiniStat label="Profit" value={fmt(todayProfit)} />
              <MiniStat label="Transfers" value={`${todayTransferQty} units`} />
            </div>
          </CardContent>
        </Card>

        <Card className={alertCount > 0 ? "order-1 border-destructive/30 bg-card/95 xl:order-2" : "order-1 bg-card/95 xl:order-2"}>
          <CardHeader className="border-b border-border/70 bg-muted/25">
            <CardTitle>Needs attention</CardTitle>
            <p className="text-sm text-muted-foreground">Low stock and pending internal balances.</p>
          </CardHeader>
          <CardContent className="space-y-2 p-3 md:space-y-3 md:p-5">
            {alertCount === 0 && totalPendingValue === 0 ? (
              <EmptyState text="Nothing urgent right now." />
            ) : (
              <>
                {lowProducts.slice(0, 4).map((p: any) => {
                  const shopId = (branches as any[])?.find((b) => b.code === "SHOP")?.id;
                  const onlineId = (branches as any[])?.find((b) => b.code === "ONLINE")?.id;
                  const s = Number(stockMap?.get(p.id)?.get(shopId) ?? p.shop_stock);
                  const o = Number(stockMap?.get(p.id)?.get(onlineId) ?? p.online_shop_stock);
                  const level = getProductStockLevel(Math.min(s, o));
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name} ({p.bottle_size})</p>
                        <p className="text-xs text-muted-foreground">Shop {s} | Online {o}</p>
                      </div>
                      <StockBadge level={level} />
                    </div>
                  );
                })}
                {lowMaterials.slice(0, 4).map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.current_stock} {m.usage_unit} left</p>
                    </div>
                    <StockBadge level={getStockLevel(Number(m.current_stock), Number(m.reorder_level))} />
                  </div>
                ))}
                {totalPendingValue > 0 && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                    {fmt(totalPendingValue)} is still pending from internal transactions.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent sales today</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/sales")}>Open sales</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!todaySales?.length ? (
              <EmptyState text="No sales recorded today." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaySales.slice(0, 6).map((sale: any) => {
                    const isNorm = !!sale.sale_items;
                    if (isNorm) {
                      const first = (sale.sale_items as any[])[0];
                      const qty = (sale.sale_items as any[]).reduce((s, it) => s + Number(it.quantity || 0), 0);
                      return (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">
                            {first?.products?.name || `${(sale.sale_items as any[]).length} items`}
                            {first?.products?.bottle_size && <span className="ml-1 text-xs text-muted-foreground">({first.products.bottle_size})</span>}
                          </TableCell>
                          <TableCell>{qty}</TableCell>
                          <TableCell className="capitalize">—</TableCell>
                          <TableCell className="text-right">{fmt(sale.total)}</TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">
                          {sale.products?.name}
                          <span className="ml-1 text-xs text-muted-foreground">({sale.products?.bottle_size})</span>
                        </TableCell>
                        <TableCell>{sale.quantity_sold}</TableCell>
                        <TableCell className="capitalize">{String(sale.sale_source).replace("_", " ")}</TableCell>
                        <TableCell className="text-right">{fmt(sale.total_revenue)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Pending internal</CardTitle>
              {totalPendingValue > 0 && <p className="mt-1 text-sm text-muted-foreground">{fmt(totalPendingValue)} total value</p>}
            </div>
            {isAdmin && <Button variant="ghost" size="sm" onClick={() => navigate("/internal")}>Open internal</Button>}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {owesSummary.length === 0 ? (
              <EmptyState text="No pending internal transactions." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Cash</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owesSummary.map(o => (
                    <TableRow key={o.name}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell>{o.productItems > 0 ? `${o.productItems} items` : "-"}</TableCell>
                      <TableCell>{o.cash > 0 ? fmt(o.cash) : "-"}</TableCell>
                      <TableCell className="text-right">{o.productValue > 0 ? fmt(o.productValue) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Product stock</CardTitle>
          <p className="text-sm text-muted-foreground">Current counts across production, shop, and online stock.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!products?.length ? (
            <EmptyState text="No products yet." />
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
                {(products as any[]).map((p: any) => {
                  const shopId = (branches as any[])?.find((b) => b.code === "SHOP")?.id;
                  const onlineId = (branches as any[])?.find((b) => b.code === "ONLINE")?.id;
                  const prodId = (branches as any[])?.find((b) => b.code === "PROD")?.id;
                  const s = Number(stockMap?.get(p.id)?.get(shopId) ?? p.shop_stock);
                  const o = Number(stockMap?.get(p.id)?.get(onlineId) ?? p.online_shop_stock);
                  const prod = Number(stockMap?.get(p.id)?.get(prodId) ?? p.production_stock);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        <span className="ml-1 text-xs text-muted-foreground">({p.bottle_size})</span>
                      </TableCell>
                      <TableCell>{prod}</TableCell>
                      <TableCell>{s}</TableCell>
                      <TableCell>{o}</TableCell>
                      <TableCell>
                        <StockBadge level={getProductStockLevel(Math.min(s, o))} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneClass = {
    neutral: "text-primary-foreground bg-primary/80",
    success: "text-primary-foreground bg-primary/80",
    danger: "text-destructive bg-destructive/10",
  }[tone];

  return (
    <Card className="bg-card/95">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 md:mb-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:text-xs">{label}</span>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8 ${toneClass}`}>{icon}</span>
        </div>
        <p className={`text-xl font-semibold md:text-2xl ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground md:text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 md:p-4">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:text-xs">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold md:mt-3 md:text-xl">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
