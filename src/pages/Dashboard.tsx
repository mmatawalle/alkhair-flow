import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";

export default function Dashboard() {
  const { data: rawMaterials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchase_records", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_records").select("*, raw_materials(name)").order("purchase_date", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["sale_records", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_records").select("*, products(name, bottle_size)").order("sale_date", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: allSales } = useQuery({
    queryKey: ["sale_records", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_records").select("total_revenue, total_cogs, profit");
      if (error) throw error;
      return data;
    },
  });

  const { data: allPurchases } = useQuery({
    queryKey: ["purchase_records", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_records").select("total_cost");
      if (error) throw error;
      return data;
    },
  });

  const lowStockMaterials = rawMaterials?.filter(m => m.current_stock <= m.reorder_level) ?? [];
  const totalPurchases = allPurchases?.reduce((sum, p) => sum + Number(p.total_cost), 0) ?? 0;
  const totalRevenue = allSales?.reduce((sum, s) => sum + Number(s.total_revenue), 0) ?? 0;
  const totalCOGS = allSales?.reduce((sum, s) => sum + Number(s.total_cogs), 0) ?? 0;
  const totalProfit = allSales?.reduce((sum, s) => sum + Number(s.profit), 0) ?? 0;

  const fmt = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalPurchases)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total COGS</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalCOGS)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalProfit)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{lowStockMaterials.length}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low Stock Materials */}
        <Card>
          <CardHeader><CardTitle className="text-base">Low Stock Raw Materials</CardTitle></CardHeader>
          <CardContent>
            {lowStockMaterials.length === 0 ? (
              <p className="text-sm text-muted-foreground">All materials above reorder level.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Reorder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockMaterials.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell><Badge variant="destructive">{m.current_stock} {m.usage_unit}</Badge></TableCell>
                      <TableCell>{m.reorder_level} {m.usage_unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Product Stock Summary */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name} ({p.bottle_size})</TableCell>
                      <TableCell>{p.production_stock}</TableCell>
                      <TableCell>{p.shop_stock}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Purchases */}
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Purchases</CardTitle></CardHeader>
          <CardContent>
            {!purchases?.length ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.raw_materials?.name}</TableCell>
                      <TableCell>{p.quantity_purchased} {p.purchase_unit}</TableCell>
                      <TableCell>{fmt(p.total_cost)}</TableCell>
                      <TableCell>{p.purchase_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Sales</CardTitle></CardHeader>
          <CardContent>
            {!sales?.length ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.products?.name} ({s.products?.bottle_size})</TableCell>
                      <TableCell>{s.quantity_sold}</TableCell>
                      <TableCell>{fmt(s.total_revenue)}</TableCell>
                      <TableCell>{s.sale_date}</TableCell>
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
