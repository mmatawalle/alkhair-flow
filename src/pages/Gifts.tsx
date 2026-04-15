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
import { Plus, Trash2, Pencil, Download } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { downloadCSV } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REASONS = ["family", "friend", "promo", "VIP", "house_use"];

export default function Gifts() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [sourceLocation, setSourceLocation] = useState("shop");
  const [qty, setQty] = useState(0);
  const [giftDate, setGiftDate] = useState(new Date().toISOString().split("T")[0]);
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("family");
  const [note, setNote] = useState("");
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

  const { data: gifts, isLoading } = useQuery({
    queryKey: ["gift_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_records").select("*, products(name, bottle_size)").order("gift_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === productId);
  const availableStock = selectedProduct
    ? (sourceLocation === "production" ? Number(selectedProduct.production_stock) : Number(selectedProduct.shop_stock))
    : 0;

  const resetForm = () => {
    setEditingId(null); setProductId(""); setQty(0); setRecipient(""); setNote("");
    setSourceLocation("shop"); setReason("family");
    setGiftDate(new Date().toISOString().split("T")[0]);
  };

  const openEdit = (g: any) => {
    setEditingId(g.id);
    setProductId(g.product_id);
    setSourceLocation(g.source_location);
    setQty(g.quantity);
    setGiftDate(g.gift_date);
    setRecipient(g.recipient || "");
    setReason(g.reason_category);
    setNote(g.note || "");
    setOpen(true);
  };

  const giftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (qty <= 0) throw new Error("Quantity must be > 0");

      if (editingId) {
        const oldGift = gifts?.find(g => g.id === editingId);
        if (!oldGift) throw new Error("Gift not found");

        // Restore old stock
        const oldProduct = products?.find(p => p.id === oldGift.product_id);
        if (oldProduct) {
          const restoreData = oldGift.source_location === "production"
            ? { production_stock: Number(oldProduct.production_stock) + Number(oldGift.quantity) }
            : { shop_stock: Number(oldProduct.shop_stock) + Number(oldGift.quantity) };
          await supabase.from("products").update(restoreData).eq("id", oldGift.product_id);
        }

        // Re-fetch and check new stock
        const { data: freshProduct } = await supabase.from("products").select("*").eq("id", productId).single();
        if (!freshProduct) throw new Error("Product not found");
        const newAvail = sourceLocation === "production" ? Number(freshProduct.production_stock) : Number(freshProduct.shop_stock);
        if (qty > newAvail) throw new Error(`Not enough stock. Available: ${newAvail}`);

        // Update gift record
        await supabase.from("gift_records").update({
          product_id: productId, source_location: sourceLocation, quantity: qty,
          gift_date: giftDate, recipient: recipient || null, reason_category: reason, note: note || null,
        }).eq("id", editingId);

        // Deduct new stock
        const deductData = sourceLocation === "production"
          ? { production_stock: Number(freshProduct.production_stock) - qty }
          : { shop_stock: Number(freshProduct.shop_stock) - qty };
        await supabase.from("products").update(deductData).eq("id", productId);
      } else {
        if (qty > availableStock) throw new Error(`Not enough stock. Available: ${availableStock}`);

        await supabase.from("gift_records").insert({
          product_id: productId, source_location: sourceLocation, quantity: qty,
          gift_date: giftDate, recipient: recipient || null, reason_category: reason, note: note || null,
        });

        const updateData = sourceLocation === "production"
          ? { production_stock: Number(selectedProduct.production_stock) - qty }
          : { shop_stock: Number(selectedProduct.shop_stock) - qty };
        await supabase.from("products").update(updateData).eq("id", productId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); resetForm();
      logAudit({ action_type: editingId ? "edit" : "create", module: "gifts", new_values: { product_id: productId, quantity: qty, recipient, reason } });
      toast({ title: editingId ? "Gift updated ✓" : "Gift recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const gift = gifts?.find(g => g.id === id);
      if (!gift) throw new Error("Gift not found");
      const product = products?.find(p => p.id === gift.product_id);
      if (product) {
        const updateData = gift.source_location === "production"
          ? { production_stock: Number(product.production_stock) + Number(gift.quantity) }
          : { shop_stock: Number(product.shop_stock) + Number(gift.quantity) };
        await supabase.from("products").update(updateData).eq("id", gift.product_id);
      }
      const { error } = await supabase.from("gift_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setDeleteId(null);
      logAudit({ action_type: "delete", module: "gifts", record_id: deleteId || undefined, note: "gift deleted, stock restored" });
      toast({ title: "Gift deleted & stock restored ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  let filtered = gifts;
  if (dateFrom) filtered = filtered?.filter(g => (g as any).gift_date >= dateFrom);
  if (dateTo) filtered = filtered?.filter(g => (g as any).gift_date <= dateTo);

  const { sort, toggleSort, sorted } = useSortableTable(filtered);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Gifts / Free Items</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => {
            if (!sorted.length) return;
            downloadCSV("gifts.csv", ["Date", "Product", "Source", "Qty", "Recipient", "Reason"],
              sorted.map((g: any) => [g.gift_date, `${g.products?.name} (${g.products?.bottle_size})`, g.source_location, g.quantity, g.recipient || "", g.reason_category])
            );
          }}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Gift</Button>
        </div>
      </div>

      <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />

      {/* Mobile card list */}
      <div className="mobile-card-list">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : sorted.map((g: any) => (
          <div key={g.id} className="mobile-card-item">
            <div className="mobile-card-header">
              <div>
                <p className="mobile-card-title">{g.products?.name} <span className="text-muted-foreground font-normal">({g.products?.bottle_size})</span></p>
                <p className="text-xs text-muted-foreground">{g.gift_date} · {g.source_location}</p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{g.reason_category?.replace(/_/g, " ")}</span>
            </div>
            <div className="mobile-card-row">
              <span className="text-sm text-muted-foreground">{g.recipient || "No recipient"}</span>
              <span className="text-sm font-semibold">{g.quantity} units</span>
            </div>
            <div className="mobile-card-actions">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(g)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setDeleteId(g.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
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
                    <SortableTableHead label="Date" sortKey="gift_date" sort={sort} onToggle={toggleSort} />
                    <TableHead>Product</TableHead>
                    <TableHead>Source</TableHead>
                    <SortableTableHead label="Qty" sortKey="quantity" sort={sort} onToggle={toggleSort} />
                    <TableHead>Recipient</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
                  ) : sorted.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="whitespace-nowrap">{g.gift_date}</TableCell>
                      <TableCell className="font-medium">{g.products?.name} <span className="text-muted-foreground text-xs">({g.products?.bottle_size})</span></TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{g.source_location}</Badge></TableCell>
                      <TableCell>{g.quantity}</TableCell>
                      <TableCell>{g.recipient || "—"}</TableCell>
                      <TableCell className="capitalize text-sm">{g.reason_category?.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Gift" : "Add Gift / Free Item"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); giftMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
              </SelectContent>
            </Select>
            <div>
              <label className="text-sm text-muted-foreground">Take from</label>
              <Select value={sourceLocation} onValueChange={setSourceLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedProduct && !editingId && <p className="text-sm text-muted-foreground">Available: <strong>{availableStock}</strong></p>}
            <Input type="number" min={1} placeholder="Quantity" value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} required />
            <Input type="date" value={giftDate} onChange={(e) => setGiftDate(e.target.value)} />
            <Input placeholder="Recipient (optional)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={giftMutation.isPending}>{giftMutation.isPending ? "Saving..." : editingId ? "Update" : "Add Gift"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this gift record?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be restored. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
