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
import { Plus, Ban, Pencil } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Sales() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [qtySold, setQtySold] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [saleType, setSaleType] = useState("cash");
  const [saleSource, setSaleSource] = useState("shop");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    ? (saleSource === "online_shop" ? Number(selectedProduct.online_shop_stock) : Number(selectedProduct.shop_stock))
    : 0;
  const totalRevenue = qtySold * sellingPrice;
  const costPerUnit = Number(selectedProduct?.average_cost_per_unit || 0);
  const totalCOGS = qtySold * costPerUnit;
  const profit = totalRevenue - totalCOGS;

  const resetForm = () => {
    setEditingId(null); setProductId(""); setQtySold(0); setSellingPrice(0);
    setSaleType("cash"); setSaleSource("shop"); setNote("");
    setSaleDate(new Date().toISOString().split("T")[0]);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setProductId(s.product_id);
    setQtySold(s.quantity_sold);
    setSellingPrice(s.selling_price_per_unit);
    setSaleType(s.sale_type);
    setSaleSource(s.sale_source);
    setSaleDate(s.sale_date);
    setNote(s.note || "");
    setOpen(true);
  };

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (qtySold <= 0) throw new Error("Quantity must be > 0");

      if (editingId) {
        // Editing: reverse old stock, apply new
        const oldSale = sales?.find(s => s.id === editingId);
        if (!oldSale) throw new Error("Sale not found");
        const oldProduct = products?.find(p => p.id === oldSale.product_id);

        // Restore old stock
        if (oldProduct) {
          const restoreData = oldSale.sale_source === "online_shop"
            ? { online_shop_stock: Number(oldProduct.online_shop_stock) + Number(oldSale.quantity_sold) }
            : { shop_stock: Number(oldProduct.shop_stock) + Number(oldSale.quantity_sold) };
          await supabase.from("products").update(restoreData).eq("id", oldSale.product_id);
        }

        // Re-fetch product for new stock check
        const { data: freshProduct } = await supabase.from("products").select("*").eq("id", productId).single();
        if (!freshProduct) throw new Error("Product not found");
        const newAvail = saleSource === "online_shop" ? Number(freshProduct.online_shop_stock) : Number(freshProduct.shop_stock);
        if (qtySold > newAvail) throw new Error(`Not enough stock. Available: ${newAvail}`);

        // Update sale record
        const { error: updateError } = await supabase.from("sale_records").update({
          product_id: productId, quantity_sold: qtySold, selling_price_per_unit: sellingPrice,
          total_revenue: totalRevenue, cost_per_unit: costPerUnit, total_cogs: totalCOGS,
          profit, sale_type: saleType, sale_source: saleSource, sale_date: saleDate, note: note || null,
        }).eq("id", editingId);
        if (updateError) throw updateError;

        // Deduct new stock
        const deductData = saleSource === "online_shop"
          ? { online_shop_stock: Number(freshProduct.online_shop_stock) - qtySold }
          : { shop_stock: Number(freshProduct.shop_stock) - qtySold };
        await supabase.from("products").update(deductData).eq("id", productId);
      } else {
        // New sale
        if (qtySold > availableStock) {
          throw new Error(`Not enough ${saleSource === "online_shop" ? "online shop" : "shop"} stock. Available: ${availableStock}`);
        }

        const { error: insertError } = await supabase.from("sale_records").insert({
          product_id: productId, quantity_sold: qtySold, selling_price_per_unit: sellingPrice,
          total_revenue: totalRevenue, cost_per_unit: costPerUnit, total_cogs: totalCOGS,
          profit, sale_type: saleType, sale_source: saleSource, sale_date: saleDate, note: note || null,
        });
        if (insertError) throw insertError;

        const updateData = saleSource === "online_shop"
          ? { online_shop_stock: Number(selectedProduct.online_shop_stock) - qtySold }
          : { shop_stock: Number(selectedProduct.shop_stock) - qtySold };
        await supabase.from("products").update(updateData).eq("id", productId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); resetForm();
      toast({ title: editingId ? "Sale updated ✓" : "Sale recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const sale = sales?.find(s => s.id === id);
      if (!sale) throw new Error("Sale not found");
      const { error: voidError } = await supabase.from("sale_records").update({ voided: true }).eq("id", id);
      if (voidError) throw voidError;
      const product = products?.find(p => p.id === sale.product_id);
      if (product) {
        const updateData = sale.sale_source === "online_shop"
          ? { online_shop_stock: Number(product.online_shop_stock) + Number(sale.quantity_sold) }
          : { shop_stock: Number(product.shop_stock) + Number(sale.quantity_sold) };
        await supabase.from("products").update(updateData).eq("id", sale.product_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setVoidId(null);
      toast({ title: "Sale voided ✓", description: "Stock restored." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  let filtered = sales;
  if (dateFrom) filtered = filtered?.filter(s => s.sale_date >= dateFrom);
  if (dateTo) filtered = filtered?.filter(s => s.sale_date <= dateTo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Sales</h2>
        <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Sale</Button>
      </div>

      <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />

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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center">Loading...</TableCell></TableRow>
              ) : filtered?.map((s: any) => (
                <TableRow key={s.id} className={s.voided ? "opacity-40 line-through" : ""}>
                  <TableCell>{s.sale_date}</TableCell>
                  <TableCell className="font-medium">{s.products?.name} ({s.products?.bottle_size})</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{s.sale_source === "online_shop" ? "Online Shop" : "Shop"}</Badge></TableCell>
                  <TableCell>{s.quantity_sold}</TableCell>
                  <TableCell>{fmt(s.total_revenue)}</TableCell>
                  <TableCell>{fmt(s.total_cogs)}</TableCell>
                  <TableCell className={Number(s.profit) >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(s.profit)}</TableCell>
                  <TableCell><Badge variant="outline">{s.voided ? "VOIDED" : s.sale_type}</Badge></TableCell>
                  <TableCell>
                    {!s.voided && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Void" onClick={() => setVoidId(s.id)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Sale" : "Add Sale"}</DialogTitle></DialogHeader>
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

            {selectedProduct && !editingId && (
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
              <Button type="submit" disabled={saleMutation.isPending}>{saleMutation.isPending ? "Saving..." : editingId ? "Update Sale" : "Add Sale"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!voidId} onOpenChange={() => setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this sale?</AlertDialogTitle>
            <AlertDialogDescription>This will restore the stock and reverse the revenue. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => voidId && voidMutation.mutate(voidId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Void Sale</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
