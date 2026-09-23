import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, SlidersHorizontal, Eye } from "lucide-react";
import { MobileList, MobileListItem } from "@/components/MobileList";

import { logAudit } from "@/lib/audit";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { branchCodeToLocation, fetchBranches, fetchStockMap, getBranchQty, setBranchQty, type Branch } from "@/lib/inventory";

const REASONS = ["opening_stock", "correction", "damage_spoilage", "recount_difference", "house_use", "promo_free_use"];

export default function StockAdjustments() {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<"product" | "raw_material">("product");
  const [itemId, setItemId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [newQty, setNewQty] = useState<number | "">(0);
  const [reason, setReason] = useState("correction");
  const [affectCost, setAffectCost] = useState(false);
  const [adjustedBy, setAdjustedBy] = useState("");
  const [adjustDate, setAdjustDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });

  const productIds = ((products as any[]) || []).map((p) => p.id);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const { data: materials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: adjustments, isLoading } = useQuery({
    queryKey: ["stock_adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_adjustments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedItem = itemType === "product"
    ? (products as any[])?.find((p: any) => p.id === itemId)
    : materials?.find((m: any) => m.id === itemId);

  const selectedBranch = (branches || []).find((b) => b.id === branchId);

  const oldQty = (() => {
    if (!selectedItem) return 0;
    if (itemType === "raw_material") return Number((selectedItem as any).current_stock);
    if (!branchId) return 0;
    return getBranchQty(selectedItem as any, stockMap || new Map(), (branches || []) as Branch[], itemId, branchId);
  })();

  const branchName = (adj: any) =>
    (branches || []).find((b) => b.id === adj.branch_id)?.name ||
    (adj.location ? String(adj.location).replace("_", " ") : "—");

  const numericNewQty = newQty === "" ? 0 : newQty;
  const adjustmentAmount = numericNewQty - oldQty;

  const getItemName = (adj: any) => {
    if (adj.item_type === "product") {
      const p = ((products as any[]) || []).find((pr: any) => pr.id === adj.item_id);
      return p ? `${p.name} (${p.bottle_size})` : adj.item_id;
    }
    const m = materials?.find((mat: any) => mat.id === adj.item_id);
    return m ? m.name : adj.item_id;
  };

  const { sort, toggleSort, sorted } = useSortableTable(adjustments);

  const resetForm = () => {
    setItemId(""); setNewQty(0); setNote(""); setAdjustedBy("");
    setAffectCost(false); setReason("correction"); setBranchId("");
    setAdjustDate(new Date().toISOString().split("T")[0]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!itemId) throw new Error("Select an item");
      if (!adjustedBy) throw new Error("Enter who adjusted");
      if (itemType === "product" && !branchId) throw new Error("Select a branch");

      const branch = (branches || []).find((b) => b.id === branchId);
      await supabase.from("stock_adjustments").insert({
        item_type: itemType, item_id: itemId,
        location: branch ? branchCodeToLocation(branch.code) : "shop",
        branch_id: itemType === "product" ? branchId : null,
        old_quantity: oldQty, new_quantity: numericNewQty,
        adjustment_amount: adjustmentAmount, reason,
        affect_average_cost: affectCost,
        adjusted_by: adjustedBy, adjustment_date: adjustDate,
        note: note || null,
      });

      // Apply stock change
      if (itemType === "product" && branch) {
        await setBranchQty(itemId, branchId, branch.code, numericNewQty);
      } else {
        await supabase.from("raw_materials").update({ current_stock: numericNewQty }).eq("id", itemId);
      }

      await logAudit({
        action_type: "stock_adjustment",
        module: "stock_adjustment",
        record_id: itemId,
        old_values: { quantity: oldQty },
        new_values: { quantity: numericNewQty, reason, branch: branch?.name },
        note: `${adjustedBy}: ${reason.replace(/_/g, " ")}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false); resetForm();
      toast({ title: "Stock adjusted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (adj: any) => {
      // Reverse the stock change
      const reverseAmount = -Number(adj.adjustment_amount);
      if (adj.item_type === "product") {
        const map = await fetchStockMap([adj.item_id]);
        const branch = (branches || []).find((b) => b.id === adj.branch_id);
        if (adj.branch_id && branch) {
          const cur = Number(map.get(adj.item_id)?.get(adj.branch_id) ?? adj.new_quantity);
          const next = cur + reverseAmount;
          if (next < 0) throw new Error("Cannot delete: would result in negative stock");
          await setBranchQty(adj.item_id, adj.branch_id, branch.code, next);
        } else {
          // Legacy row without branch link: fall back to legacy columns
          const { data: product } = await supabase.from("products").select("*").eq("id", adj.item_id).single();
          if (product) {
            const updateData: Record<string, number> = {};
            const loc = adj.location as string;
            if (loc === "production") updateData.production_stock = Number((product as any).production_stock) + reverseAmount;
            else if (loc === "online_shop") updateData.online_shop_stock = Number((product as any).online_shop_stock) + reverseAmount;
            else updateData.shop_stock = Number((product as any).shop_stock) + reverseAmount;

            const newVal = Object.values(updateData)[0];
            if (newVal < 0) throw new Error("Cannot delete: would result in negative stock");

            await supabase.from("products").update(updateData as any).eq("id", adj.item_id);
          }
        }
      } else {
        const { data: mat } = await supabase.from("raw_materials").select("*").eq("id", adj.item_id).single();
        if (mat) {
          const newStock = Number(mat.current_stock) + reverseAmount;
          if (newStock < 0) throw new Error("Cannot delete: would result in negative stock");
          await supabase.from("raw_materials").update({ current_stock: newStock }).eq("id", adj.item_id);
        }
      }

      await supabase.from("stock_adjustments").delete().eq("id", adj.id);

      await logAudit({
        action_type: "delete",
        module: "stock_adjustment",
        record_id: adj.id,
        old_values: { item: adj.item_id, old_quantity: adj.old_quantity, new_quantity: adj.new_quantity, reason: adj.reason },
        note: `Deleted adjustment & reversed stock by ${reverseAmount}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setDeleteTarget(null);
      toast({ title: "Adjustment deleted & stock reversed ✓" });
    },
    onError: (e: any) => { setDeleteTarget(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Stock Adjustments</h2>
        <Button onClick={() => { resetForm(); setOpen(true); }} className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />New Adjustment</Button>
      </div>

      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No adjustments yet</p>
        ) : sorted.map((adj: any) => (
          <MobileListItem
            key={adj.id}
            avatarFallback={(getItemName(adj)?.charAt(0) || "A").toUpperCase()}
            supportingIcon={<SlidersHorizontal className="h-3 w-3" />}
            heading={getItemName(adj)}
            caption={`${adj.created_at || adj.adjustment_date} · ${adj.reason?.replace(/_/g, " ")}`}
            meta={`${adj.old_quantity} → ${adj.new_quantity} · ${branchName(adj)}${adj.adjusted_by ? ` · ${adj.adjusted_by}` : ""}`}
            trailing={
              <Badge variant="outline" className={Number(adj.adjustment_amount) >= 0 ? "text-emerald-600 border-emerald-200" : "text-destructive border-destructive/20"}>
                {Number(adj.adjustment_amount) >= 0 ? "+" : ""}{adj.adjustment_amount}
              </Badge>
            }
            actions={[
              { id: "view", label: "View", icon: <Eye className="h-4 w-4" />, onClick: () => {} },
              { id: "delete", label: "Delete & Reverse", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteTarget(adj), variant: "destructive" },
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
                    <SortableTableHead label="Date" sortKey="adjustment_date" sort={sort} onToggle={toggleSort} />
                    <TableHead>Type</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Old → New</TableHead>
                    <SortableTableHead label="Change" sortKey="adjustment_amount" sort={sort} onToggle={toggleSort} />
                    <TableHead>Reason</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center">Loading...</TableCell></TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No adjustments yet</TableCell></TableRow>
                  ) : sorted.map((adj: any) => (
                    <TableRow key={adj.id}>
                      <TableCell>{adj.adjustment_date}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{adj.item_type.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="font-medium">{getItemName(adj)}</TableCell>
                      <TableCell className="capitalize">{branchName(adj)}</TableCell>
                      <TableCell>{adj.old_quantity} → {adj.new_quantity}</TableCell>
                      <TableCell className={Number(adj.adjustment_amount) >= 0 ? "text-emerald-600" : "text-destructive"}>
                        {Number(adj.adjustment_amount) >= 0 ? "+" : ""}{adj.adjustment_amount}
                      </TableCell>
                      <TableCell className="capitalize text-sm">{adj.reason?.replace(/_/g, " ")}</TableCell>
                      <TableCell>{adj.adjusted_by || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(adj)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New Adjustment Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stock Adjustment</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Item Type</label>
              <Select value={itemType} onValueChange={(v: any) => { setItemType(v); setItemId(""); setBranchId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="raw_material">Raw Material</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Item</label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {itemType === "product"
                    ? (products as any[])?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)
                    : materials?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {itemType === "product" && (
              <div>
                <label className="text-sm text-muted-foreground">Branch</label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {itemType === "raw_material" && (
              <div>
                <label className="text-sm text-muted-foreground">Location</label>
                <Input value="Production — raw materials are central" disabled className="bg-muted" />
              </div>
            )}

            {selectedItem && (
              <p className="text-sm text-muted-foreground">Current stock: <strong>{oldQty}</strong></p>
            )}

            <div>
              <label className="text-sm text-muted-foreground">New Quantity</label>
              <Input
                type="number"
                step="any"
                min={0}
                value={newQty}
                onChange={e => setNewQty(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </div>

            {selectedItem && (
              <p className={`text-sm font-medium ${adjustmentAmount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                Change: {adjustmentAmount >= 0 ? "+" : ""}{adjustmentAmount}
              </p>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Affect Average Cost?</p>
                <p className="text-xs text-muted-foreground">Usually no. Only for opening stock with known cost.</p>
              </div>
              <Switch checked={affectCost} onCheckedChange={setAffectCost} />
            </div>

            <Input type="date" value={adjustDate} onChange={e => setAdjustDate(e.target.value)} />
            <Input placeholder="Adjusted by (who?)" value={adjustedBy} onChange={e => setAdjustedBy(e.target.value)} required />
            <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />

            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Apply Adjustment"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Adjustment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the stock change ({deleteTarget?.adjustment_amount >= 0 ? "+" : ""}{deleteTarget?.adjustment_amount}) and delete this record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete & Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
