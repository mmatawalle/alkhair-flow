import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";

export default function Sales() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qtySold, setQtySold] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [saleType, setSaleType] = useState("cash");
  const [saleSource, setSaleSource] = useState("shop");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if ((location.state as any)?.openDialog) setOpen(true);
  }, [location.state]);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sale_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_records").select("*, products(name, bottle_size)").order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === productId);
  const availableStock = selectedProduct
    ? (saleSource === "online_shop" ? Number((selectedProduct as any).online_shop_stock ?? 0) : Number(selectedProduct.shop_stock))
    : 0;
  const totalRevenue = qtySold * sellingPrice;
  const costPerUnit = Number(selectedProduct?.average_cost_per_unit || 0);
  const totalCOGS = qtySold * costPerUnit;
  const profit = totalRevenue - totalCOGS;

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (qtySold <= 0) throw new Error("Quantity must be > 0");
      if (qtySold > availableStock) {
        throw new Error(`Not enough ${saleSource === "online_shop" ? "online shop" : "shop"} stock. Available: ${availableStock}`);
      }

      const { error: insertError } = await supabase.from("sale_records").insert({
        product_id: productId,
        quantity_sold: qtySold,
        selling_price_per_unit: sellingPrice,
        total_revenue: totalRevenue,
        cost_per_unit: costPerUnit,
        total_cogs: totalCOGS,
        profit: profit,
        sale_type: saleType,
        sale_source: saleSource,
        sale_date: saleDate,
        note: note || null,
      });
      if (insertError) throw insertError;

      const currentStock = saleSource === "online_shop" ? Number((selectedProduct as any).online_shop_stock ?? 0) : Number(selectedProduct.shop_stock);
      const updateData = saleSource === "online_shop"
        ? { online_shop_stock: currentStock - qtySold }
        : { shop_stock: currentStock - qtySold };
      const { error: updateError } = await supabase.from("products").update(updateData).eq("id", productId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId(""); setQtySold(0); setSellingPrice(0); setNote("");
      toast({ title: "Sale recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Sales</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Sale</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>COGS</TableHead>
                <TableHead>Profit</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center">Loading...</TableCell></TableRow>
              ) : sales?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>{s.sale_date}</TableCell>
                  <TableCell className="font-medium">{s.products?.name} ({s.products?.bottle_size})</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{s.sale_source === "online_shop" ? "Online Shop" : "Shop"}</Badge></TableCell>
                  <TableCell>{s.quantity_sold}</TableCell>
                  <TableCell>{fmt(s.total_revenue)}</TableCell>
                  <TableCell>{fmt(s.total_cogs)}</TableCell>
                  <TableCell className={Number(s.profit) >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(s.profit)}</TableCell>
                  <TableCell><Badge variant="outline">{s.sale_type}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Sale</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saleMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={(v) => {
              setProductId(v);
              const p = products?.find(pr => pr.id === v);
              if (p) setSellingPrice(p.selling_price);
            }}>
              <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
              </SelectContent>
            </Select>

            <div>
              <label className="text-sm text-muted-foreground">Sell from</label>
              <Select value={saleSource} onValueChange={setSaleSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="online_shop">Online Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && (
              <p className="text-sm text-muted-foreground">
                Available: <strong>{availableStock}</strong> units in {saleSource === "online_shop" ? "Online Shop" : "Shop"}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Quantity</label>
                <Input type="number" min={1} value={qtySold || ""} onChange={(e) => setQtySold(Number(e.target.value))} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Price per unit (₦)</label>
                <Input type="number" step="any" min={0} value={sellingPrice || ""} onChange={(e) => setSellingPrice(Number(e.target.value))} required />
              </div>
            </div>

            <Select value={saleType} onValueChange={setSaleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="debt">Debt</SelectItem>
              </SelectContent>
            </Select>

            {qtySold > 0 && selectedProduct && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p>Revenue: <strong>{fmt(totalRevenue)}</strong></p>
                <p>Cost: <strong>{fmt(totalCOGS)}</strong></p>
                <p>Profit: <strong className={profit >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(profit)}</strong></p>
              </div>
            )}

            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <DialogFooter>
              <Button type="submit" disabled={saleMutation.isPending}>{saleMutation.isPending ? "Saving..." : "Add Sale"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
