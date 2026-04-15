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
import { Plus, Ban, Pencil, Receipt, Download, Trash2 } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { logAudit } from "@/lib/audit";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SaleReceipt } from "@/components/SaleReceipt";
import { downloadCSV } from "@/lib/csv-export";
import { useAuth } from "@/contexts/AuthContext";

interface SaleItem {
  key: number;
  product_id: string;
  quantity_sold: number;
  selling_price_per_unit: number;
  note: string;
}

const emptySaleItem = (key: number): SaleItem => ({
  key,
  product_id: "",
  quantity_sold: 0,
  selling_price_per_unit: 0,
  note: "",
});

export default function Sales() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextSaleKey, setNextSaleKey] = useState(2);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([emptySaleItem(1)]);
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
  const [searchText, setSearchText] = useState("");
  const [receiptSale, setReceiptSale] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isStaff } = useAuth();
  const canManage = !isStaff;

  useEffect(() => {
    if ((location.state as any)?.openDialog) {
      resetForm();
      setOpen(true);
    }
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
    setSaleItems([emptySaleItem(1)]);
    setNextSaleKey(2);
  };

  const addSaleRow = () => {
    setSaleItems(prev => [...prev, emptySaleItem(nextSaleKey)]);
    setNextSaleKey(k => k + 1);
  };

  const removeSaleRow = (key: number) => {
    setSaleItems(prev => prev.filter(item => item.key !== key));
  };

  const updateSaleRow = (key: number, field: keyof SaleItem, value: string | number) => {
    setSaleItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const next = { ...item, [field]: value };
      if (field === "product_id") {
        const product = products?.find(p => p.id === value);
        next.selling_price_per_unit = Number(product?.selling_price || 0);
      }
      return next;
    }));
  };

  const getRowProduct = (id: string) => products?.find(p => p.id === id);
  const validSaleItems = saleItems.filter(item => item.product_id && item.quantity_sold > 0 && item.selling_price_per_unit >= 0);
  const batchTotalRevenue = validSaleItems.reduce((sum, item) => sum + item.quantity_sold * item.selling_price_per_unit, 0);

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

  const batchSaleMutation = useMutation({
    mutationFn: async () => {
      const valid = validSaleItems;
      if (!valid.length) throw new Error("Add at least one sale item");

      const stockNeeded = new Map<string, number>();
      for (const item of valid) {
        const product = getRowProduct(item.product_id);
        if (!product) throw new Error("Select a product for every sale row");
        const stockKey = `${item.product_id}:${saleSource}`;
        stockNeeded.set(stockKey, (stockNeeded.get(stockKey) || 0) + Number(item.quantity_sold));
      }

      for (const [stockKey, qtyNeeded] of stockNeeded.entries()) {
        const [pid, source] = stockKey.split(":");
        const product = getRowProduct(pid);
        if (!product) throw new Error("Product not found");
        const available = source === "online_shop" ? Number(product.online_shop_stock) : Number(product.shop_stock);
        if (qtyNeeded > available) {
          throw new Error(`Not enough stock for ${product.name}. Available: ${available}, needed: ${qtyNeeded}`);
        }
      }

      const payload = valid.map(item => {
        const product = getRowProduct(item.product_id);
        const cost = Number(product?.average_cost_per_unit || 0);
        const revenue = Number(item.quantity_sold) * Number(item.selling_price_per_unit);
        const cogs = Number(item.quantity_sold) * cost;

        return {
          product_id: item.product_id,
          quantity_sold: item.quantity_sold,
          selling_price_per_unit: item.selling_price_per_unit,
          total_revenue: revenue,
          cost_per_unit: cost,
          total_cogs: cogs,
          profit: revenue - cogs,
          sale_type: saleType,
          sale_source: saleSource,
          sale_date: saleDate,
          note: item.note || note || null,
        };
      });

      const { data, error } = await supabase.from("sale_records").insert(payload).select("id, product_id, quantity_sold, total_revenue");
      if (error) throw error;

      for (const [stockKey, qtySoldTotal] of stockNeeded.entries()) {
        const [pid, source] = stockKey.split(":");
        const product = getRowProduct(pid);
        if (!product) throw new Error("Product not found");
        const updateData = source === "online_shop"
          ? { online_shop_stock: Number(product.online_shop_stock) - qtySoldTotal }
          : { shop_stock: Number(product.shop_stock) - qtySoldTotal };
        const { error: updateError } = await supabase.from("products").update(updateData).eq("id", pid);
        if (updateError) throw updateError;
      }

      for (const row of data || []) {
        await logAudit({
          action_type: "create",
          module: "sales",
          record_id: row.id,
          new_values: { product_id: row.product_id, quantity_sold: row.quantity_sold, total_revenue: row.total_revenue },
        });
      }
    },
    onSuccess: () => {
      const count = validSaleItems.length;
      qc.invalidateQueries({ queryKey: ["sale_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      resetForm();
      toast({ title: `${count} sale(s) recorded ✓` });
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
  if (searchText) {
    const s = searchText.toLowerCase();
    filtered = filtered?.filter((r: any) => r.products?.name?.toLowerCase().includes(s) || r.note?.toLowerCase().includes(s));
  }

  const { sort, toggleSort, sorted } = useSortableTable(filtered);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Sales</h2>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {canManage && (
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => {
              if (!filtered?.length) return;
              downloadCSV("sales.csv",
                ["Date", "Product", "Source", "Qty", "Revenue", "COGS", "Profit", "Type", "Voided"],
                filtered.map((s: any) => [s.sale_date, `${s.products?.name} (${s.products?.bottle_size})`, s.sale_source, s.quantity_sold, s.total_revenue, s.total_cogs, s.profit, s.sale_type, s.voided ? "Yes" : "No"])
              );
            }}><Download className="mr-2 h-4 w-4" />Export</Button>
          )}
          <Button className="flex-1 sm:flex-none" onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Sale</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input placeholder="Search product..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full sm:w-[180px]" />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      {/* Mobile card list */}
      <div className="mobile-card-list">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : sorted.map((s: any) => (
          <div key={s.id} className={`mobile-card-item ${s.voided ? "opacity-40" : ""}`}>
            <div className="mobile-card-header">
              <div>
                <p className="mobile-card-title">{s.products?.name} <span className="text-muted-foreground font-normal">({s.products?.bottle_size})</span></p>
                <p className="text-xs text-muted-foreground">{s.sale_date} · {s.sale_source === "online_shop" ? "Online" : "Shop"}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{s.voided ? "VOIDED" : s.sale_type}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="mobile-card-label">Qty</p>
                <p className="mobile-card-value">{s.quantity_sold}</p>
              </div>
              <div>
                <p className="mobile-card-label">Revenue</p>
                <p className="mobile-card-value">{fmt(s.total_revenue)}</p>
              </div>
              <div>
                <p className="mobile-card-label">Profit</p>
                <p className={`mobile-card-value ${Number(s.profit) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(s.profit)}</p>
              </div>
            </div>
            <div className="mobile-card-actions">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setReceiptSale(s)}>
                <Receipt className="h-3.5 w-3.5 mr-1" /> Receipt
              </Button>
              {canManage && !s.voided && (
                <>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setVoidId(s.id)}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Void
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="desktop-table">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Date" sortKey="sale_date" sort={sort} onToggle={toggleSort} />
                    <TableHead>Product</TableHead>
                    <TableHead>Source</TableHead>
                    <SortableTableHead label="Qty" sortKey="quantity_sold" sort={sort} onToggle={toggleSort} />
                    <SortableTableHead label="Revenue" sortKey="total_revenue" sort={sort} onToggle={toggleSort} />
                    <TableHead>COGS</TableHead>
                    <SortableTableHead label="Profit" sortKey="profit" sort={sort} onToggle={toggleSort} />
                    <TableHead>Type</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center">Loading...</TableCell></TableRow>
                  ) : sorted.map((s: any) => (
                    <TableRow key={s.id} className={s.voided ? "opacity-40 line-through" : ""}>
                      <TableCell className="whitespace-nowrap">{s.sale_date}</TableCell>
                      <TableCell className="font-medium">{s.products?.name} <span className="text-muted-foreground text-xs">({s.products?.bottle_size})</span></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{s.sale_source === "online_shop" ? "Online" : "Shop"}</Badge></TableCell>
                      <TableCell>{s.quantity_sold}</TableCell>
                      <TableCell>{fmt(s.total_revenue)}</TableCell>
                      <TableCell>{fmt(s.total_cogs)}</TableCell>
                      <TableCell className={Number(s.profit) >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(s.profit)}</TableCell>
                      <TableCell><Badge variant="outline">{s.voided ? "VOIDED" : s.sale_type}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Receipt" onClick={() => setReceiptSale(s)}>
                            <Receipt className="h-4 w-4" />
                          </Button>
                          {canManage && !s.voided && (
                            <>
                              <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(s)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Void" onClick={() => setVoidId(s.id)}>
                                <Ban className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className={editingId ? "" : "max-w-4xl max-h-[90vh] overflow-y-auto"}>
          <DialogHeader><DialogTitle>{editingId ? "Edit Sale" : "Add Sale"}</DialogTitle></DialogHeader>
          {editingId ? (
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
                {(selectedProduct as any).vendor_id ? (
                  <>
                    <p>Commission ({(selectedProduct as any).commission_rate}%): <strong className="text-emerald-600">{fmt(totalRevenue * Number((selectedProduct as any).commission_rate) / 100)}</strong></p>
                    <p>Vendor owed: <strong>{fmt(totalRevenue * (1 - Number((selectedProduct as any).commission_rate) / 100))}</strong></p>
                  </>
                ) : (
                  <>
                    <p>Cost: <strong>{fmt(totalCOGS)}</strong></p>
                    <p>Profit: <strong className={profit >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(profit)}</strong></p>
                  </>
                )}
              </div>
            )}

            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <DialogFooter>
              <Button type="submit" disabled={saleMutation.isPending}>{saleMutation.isPending ? "Saving..." : editingId ? "Update Sale" : "Add Sale"}</Button>
            </DialogFooter>
          </form>
          ) : (
          <form onSubmit={(e) => { e.preventDefault(); batchSaleMutation.mutate(); }} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Apply to all sale rows</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">Sell from</label>
                  <Select value={saleSource} onValueChange={setSaleSource}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shop">Shop</SelectItem>
                      <SelectItem value="online_shop">Online Shop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Payment type</label>
                  <Select value={saleType} onValueChange={setSaleType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sale date</label>
                  <Input className="h-9" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                </div>
              </div>
              <Input className="h-9" placeholder="General note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="space-y-2">
              {saleItems.map((item, idx) => {
                const rowProduct = getRowProduct(item.product_id);
                const rowStock = rowProduct
                  ? (saleSource === "online_shop" ? Number(rowProduct.online_shop_stock) : Number(rowProduct.shop_stock))
                  : 0;
                const rowRevenue = Number(item.quantity_sold) * Number(item.selling_price_per_unit);

                return (
                  <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border p-2">
                    <div className="space-y-2">
                      <div className="grid gap-2 md:grid-cols-[1.4fr_0.7fr_0.8fr]">
                        <Select value={item.product_id} onValueChange={v => updateSaleRow(item.key, "product_id", v)}>
                          <SelectTrigger className="h-9 text-xs md:text-sm"><SelectValue placeholder={`Product ${idx + 1}`} /></SelectTrigger>
                          <SelectContent>
                            {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          className="h-9 text-xs md:text-sm"
                          placeholder="Qty"
                          value={item.quantity_sold || ""}
                          onChange={e => updateSaleRow(item.key, "quantity_sold", Number(e.target.value))}
                        />
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="h-9 text-xs md:text-sm"
                          placeholder="Price (₦)"
                          value={item.selling_price_per_unit || ""}
                          onChange={e => updateSaleRow(item.key, "selling_price_per_unit", Number(e.target.value))}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                        <Input
                          className="h-9 text-xs md:text-sm"
                          placeholder="Row note (optional)"
                          value={item.note}
                          onChange={e => updateSaleRow(item.key, "note", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground md:text-right">
                          {rowProduct ? `Available: ${rowStock} · Total: ${fmt(rowRevenue)}` : "Choose a product"}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeSaleRow(item.key)} disabled={saleItems.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addSaleRow} className="w-fit">
                <Plus className="mr-1 h-3 w-3" /> Add Row
              </Button>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total revenue: </span>
                <strong>{fmt(batchTotalRevenue)}</strong>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={batchSaleMutation.isPending || validSaleItems.length === 0}>
                {batchSaleMutation.isPending ? "Saving..." : `Save All (${validSaleItems.length})`}
              </Button>
            </DialogFooter>
          </form>
          )}
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

      <SaleReceipt open={!!receiptSale} onOpenChange={() => setReceiptSale(null)} sale={receiptSale} />
    </div>
  );
}
