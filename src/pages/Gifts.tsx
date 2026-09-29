// @ts-nocheck -- references tables not yet in generated DB types
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
import { Plus, Trash2, Pencil, Download, Gift } from "lucide-react";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { downloadCSV } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { branchCodeToLocation, fetchBranches, fetchStockMap, getBranchQty, setBranchQty, type Branch } from "@/lib/inventory";

const REASONS = ["family", "friend", "promo", "VIP", "house_use"];

export default function Gifts() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [branchId, setBranchId] = useState("");
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

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });
  const productIds = ((products as any[]) || []).map((p: any) => p.id);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const { data: gifts, isLoading } = useQuery({
    queryKey: ["gift_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_records").select("*, products(name, bottle_size), branches(name)").order("gift_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = (products as any[])?.find((p: any) => p.id === productId) as any;
  const selectedBranch = (branches || []).find((b) => b.id === branchId);
  const branchName = (g: any) => (branches || []).find((b) => b.id === g.branch_id)?.name || (g.source_location ? String(g.source_location).replace("_", " ") : "—");
  const availableStock = selectedProduct && branchId
    ? getBranchQty(selectedProduct, stockMap || new Map(), (branches || []) as Branch[], productId, branchId)
    : 0;

  const resetForm = () => {
    setEditingId(null); setProductId(""); setQty(0); setRecipient(""); setNote("");
    setBranchId(""); setReason("family");
    setGiftDate(new Date().toISOString().split("T")[0]);
  };

  const openEdit = (g: any) => {
    setEditingId(g.id);
    setProductId(g.product_id);
    setBranchId(g.branch_id || "");
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
      if (!branchId) throw new Error("Select a branch");
      if (qty <= 0) throw new Error("Quantity must be > 0");
      const branch = (branches || []).find((b) => b.id === branchId);
      if (!branch) throw new Error("Branch not found");

      if (editingId) {
        const oldGift = (gifts as any[])?.find((g: any) => g.id === editingId);
        if (!oldGift) throw new Error("Gift not found");

        // Restore old stock
        if (oldGift.branch_id) {
          const oldBranch = (branches || []).find((b) => b.id === oldGift.branch_id);
          if (oldBranch) {
            const map = await fetchStockMap([oldGift.product_id]);
            const cur = Number(map.get(oldGift.product_id)?.get(oldGift.branch_id) ?? 0);
            await setBranchQty(oldGift.product_id, oldGift.branch_id, oldBranch.code, cur + Number(oldGift.quantity));
          }
        } else {
          // Legacy row fallback
          const oldProduct = (products as any[])?.find((p: any) => p.id === oldGift.product_id) as any;
          if (oldProduct) {
            const restoreData = oldGift.source_location === "production"
              ? { production_stock: Number(oldProduct.production_stock) + Number(oldGift.quantity) }
              : { shop_stock: Number(oldProduct.shop_stock) + Number(oldGift.quantity) };
            await supabase.from("products").update(restoreData as any).eq("id", oldGift.product_id);
          }
        }

        // Check new stock
        const map2 = await fetchStockMap([productId]);
        const newAvail = Number(map2.get(productId)?.get(branchId) ?? getBranchQty(selectedProduct, map2, (branches || []) as Branch[], productId, branchId));
        if (qty > newAvail) throw new Error(`Not enough stock at ${branch.name}. Available: ${newAvail}`);

        await supabase.from("gift_records").update({
          product_id: productId, branch_id: branchId, source_location: branchCodeToLocation(branch.code), quantity: qty,
          gift_date: giftDate, recipient: recipient || null, reason_category: reason, note: note || null,
        }).eq("id", editingId);

        const map3 = await fetchStockMap([productId]);
        const cur2 = Number(map3.get(productId)?.get(branchId) ?? 0);
        await setBranchQty(productId, branchId, branch.code, cur2 - qty);
      } else {
        if (qty > availableStock) throw new Error(`Not enough stock. Available: ${availableStock}`);

        await supabase.from("gift_records").insert({
          product_id: productId, branch_id: branchId, source_location: branchCodeToLocation(branch.code), quantity: qty,
          gift_date: giftDate, recipient: recipient || null, reason_category: reason, note: note || null,
        });

        const map = await fetchStockMap([productId]);
        const cur = Number(map.get(productId)?.get(branchId) ?? availableStock);
        await setBranchQty(productId, branchId, branch.code, cur - qty);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setOpen(false); resetForm();
      logAudit({ action_type: editingId ? "edit" : "create", module: "gifts", new_values: { product_id: productId, quantity: qty, recipient, reason, branch_id: branchId } });
      toast({ title: editingId ? "Gift updated ✓" : "Gift recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const gift = (gifts as any[])?.find((g: any) => g.id === id);
      if (!gift) throw new Error("Gift not found");
      if (gift.branch_id) {
        const branch = (branches || []).find((b) => b.id === gift.branch_id);
        if (branch) {
          const map = await fetchStockMap([gift.product_id]);
          const cur = Number(map.get(gift.product_id)?.get(gift.branch_id) ?? 0);
          await setBranchQty(gift.product_id, gift.branch_id, branch.code, cur + Number(gift.quantity));
        }
      } else {
        const product = (products as any[])?.find((p: any) => p.id === gift.product_id) as any;
        if (product) {
          const updateData = gift.source_location === "production"
            ? { production_stock: Number(product.production_stock) + Number(gift.quantity) }
            : { shop_stock: Number(product.shop_stock) + Number(gift.quantity) };
          await supabase.from("products").update(updateData as any).eq("id", gift.product_id);
        }
      }
      const { error } = await supabase.from("gift_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
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
            downloadCSV("gifts.csv", ["Date", "Product", "Branch", "Qty", "Recipient", "Reason"],
              sorted.map((g: any) => [g.gift_date, `${g.products?.name} (${g.products?.bottle_size})`, branchName(g), g.quantity, g.recipient || "", g.reason_category])
            );
          }}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Gift</Button>
        </div>
      </div>

      <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />

      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : sorted.map((g: any) => (
          <MobileListItem
            key={g.id}
            avatarFallback={g.products?.name || "G"}
            supportingIcon={<Gift className="h-3 w-3" />}
            heading={`${g.products?.name || "—"} (${g.products?.bottle_size || "—"}) · ${g.quantity}×`}
            caption={`${g.gift_date} · ${branchName(g)} · ${g.recipient || "—"}`}
            meta={<span className="capitalize">{g.reason_category?.replace(/_/g, " ")}</span>}
            trailing={<Badge variant="secondary" className="text-xs">{g.quantity}×</Badge>}
            actions={[
              { id: "edit", label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(g) },
              { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteId(g.id), variant: "destructive" },
            ]}
          />
        ))}
      </MobileList>

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
                      <TableCell><Badge variant="outline" className="capitalize">{branchName(g)}</Badge></TableCell>
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
              <label className="text-sm text-muted-foreground">Take from (branch)</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedProduct && branchId && <p className="text-sm text-muted-foreground">Available at {selectedBranch?.name}: <strong>{availableStock}</strong></p>}
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
