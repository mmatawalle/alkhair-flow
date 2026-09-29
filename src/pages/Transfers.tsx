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
import { Truck, Ban, ArrowLeftRight, Eye } from "lucide-react";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adjustBranchQty, fetchBranches, fetchStockMap, getBranchQty, seedBranchIds, type Branch } from "@/lib/inventory";

export default function Transfers() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(0);
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [voidId, setVoidId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });

  useEffect(() => {
    if (!branches?.length) return;
    try {
      const seeds = seedBranchIds(branches as Branch[]);
      if (!fromBranchId) setFromBranchId(seeds.prod);
      if (!toBranchId) {
        const state = location.state as any;
        if (state?.destination === "online_shop") setToBranchId(seeds.online);
        else setToBranchId(seeds.shop);
      }
      if ((location.state as any)?.openDialog) setOpen(true);
    } catch {
      // branches not seeded yet — user picks manually
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const productIds = ((products as any[]) || []).map((p) => p.id);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["transfer_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_records")
        .select("*, products(name, bottle_size), from:branches!transfer_records_from_branch_id_fkey(name), to:branches!transfer_records_to_branch_id_fkey(name)")
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = ((products as any[]) || []).find((p) => p.id === productId) as any;
  const branchName = (id: string) => (branches || []).find((b) => b.id === id)?.name || "—";
  const availableFrom = productId && fromBranchId
    ? getBranchQty(selectedProduct, stockMap || new Map(), (branches || []) as Branch[], productId, fromBranchId)
    : 0;

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (!fromBranchId || !toBranchId) throw new Error("Select source and destination branches");
      if (fromBranchId === toBranchId) throw new Error("Source and destination must differ");
      if (qty <= 0) throw new Error("Quantity must be > 0");

      const fromBranch = (branches || []).find((b) => b.id === fromBranchId)!;
      const toBranch = (branches || []).find((b) => b.id === toBranchId)!;
      const map = await fetchStockMap([productId]);
      const fromQty = Number(map.get(productId)?.get(fromBranchId) ?? getBranchQty(selectedProduct, map, (branches || []) as Branch[], productId, fromBranchId));
      if (qty > fromQty) throw new Error(`Not enough stock at ${fromBranch.name}. Available: ${fromQty}`);
      const toQty = Number(map.get(productId)?.get(toBranchId) ?? getBranchQty(selectedProduct, map, (branches || []) as Branch[], productId, toBranchId));

      const { error: insertError } = await supabase.from("transfer_records").insert({
        product_id: productId,
        quantity_transferred: qty,
        transfer_date: date,
        note: note || null,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
      });
      if (insertError) throw insertError;

      await adjustBranchQty(productId, fromBranchId, fromBranch.code, -qty, fromQty);
      await adjustBranchQty(productId, toBranchId, toBranch.code, qty, toQty);
      await logAudit({
        action_type: "create",
        module: "transfers",
        new_values: { product_id: productId, quantity: qty, from: fromBranch.name, to: toBranch.name },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfer_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setOpen(false);
      setProductId(""); setQty(0); setNote("");
      toast({ title: "Transferred ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const transfer = (transfers as any[])?.find((t) => t.id === id);
      if (!transfer) throw new Error("Transfer not found");

      const { error: voidError } = await supabase.from("transfer_records").update({ voided: true }).eq("id", id);
      if (voidError) throw voidError;

      // Resolve branches: FKs first, legacy note fallback (pre-normalization rows)
      let fromId = transfer.from_branch_id as string | null;
      let toId = transfer.to_branch_id as string | null;
      if (!fromId || !toId) {
        const seeds = seedBranchIds((branches || []) as Branch[]);
        fromId = fromId || seeds.prod;
        toId = toId || (transfer.note?.includes("Online") ? seeds.online : seeds.shop);
      }
      const fromBranch = (branches || []).find((b) => b.id === fromId)!;
      const toBranch = (branches || []).find((b) => b.id === toId)!;
      const map = await fetchStockMap([transfer.product_id]);
      const prod = ((products as any[]) || []).find((p) => p.id === transfer.product_id) as any;
      const curTo = Number(map.get(transfer.product_id)?.get(toId!) ?? getBranchQty(prod, map, (branches || []) as Branch[], transfer.product_id, toId!));
      const curFrom = Number(map.get(transfer.product_id)?.get(fromId!) ?? getBranchQty(prod, map, (branches || []) as Branch[], transfer.product_id, fromId!));
      if (curTo < Number(transfer.quantity_transferred)) {
        throw new Error(`Cannot void: destination only holds ${curTo} units`);
      }
      await adjustBranchQty(transfer.product_id, toId!, toBranch.code, -Number(transfer.quantity_transferred), curTo);
      await adjustBranchQty(transfer.product_id, fromId!, fromBranch.code, Number(transfer.quantity_transferred), curFrom);
      await logAudit({ action_type: "void", module: "transfers", record_id: id, note: "Transfer voided, stock reversed" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfer_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setVoidId(null);
      toast({ title: "Transfer voided ✓", description: "Stock reversed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const destLabel = (t: any) => t.to?.name || (t.note?.includes("Online") ? "Online Shop" : "Shop");

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Transfer Stock</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => setOpen(true)} size="sm" className="flex-1 sm:flex-none">
            <Truck className="mr-1 h-4 w-4" />New Transfer
          </Button>
        </div>
      </div>

      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : ((transfers as any[]) || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transfers yet</p>
        ) : ((transfers as any[]) || []).map((t: any) => (
          <MobileListItem
            key={t.id}
            avatarFallback={(t.products?.name?.charAt(0) || "T").toUpperCase()}
            supportingIcon={<ArrowLeftRight className="h-3 w-3" />}
            heading={t.products ? `${t.products.name} (${t.products.bottle_size})` : "—"}
            caption={`${t.transfer_date || t.created_at} · ${t.from?.name || "Production"} → ${destLabel(t)} ×${t.quantity_transferred}`}
            meta={t.note ? t.note : undefined}
            trailing={<Badge variant={t.voided ? "destructive" : "outline"} className="text-xs">{t.voided ? "VOIDED" : `${t.quantity_transferred} units`}</Badge>}
            className={t.voided ? "opacity-60" : ""}
            actions={
              t.voided
                ? [{ id: "view", label: "View", icon: <Eye className="h-4 w-4" />, onClick: () => {} }]
                : [
                    { id: "view", label: "View", icon: <Eye className="h-4 w-4" />, onClick: () => {} },
                    { id: "void", label: "Void Transfer", icon: <Ban className="h-4 w-4" />, onClick: () => setVoidId(t.id), variant: "destructive" },
                  ]
            }
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
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                  ) : ((transfers as any[]) || []).map((t: any) => (
                    <TableRow key={t.id} className={t.voided ? "opacity-40 line-through" : ""}>
                      <TableCell className="whitespace-nowrap">{t.transfer_date}</TableCell>
                      <TableCell className="font-medium">{t.products?.name} <span className="text-muted-foreground text-xs">({t.products?.bottle_size})</span></TableCell>
                      <TableCell>{t.quantity_transferred}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.voided ? "VOIDED" : `${t.from?.name || "Production"} → ${destLabel(t)}`}</Badge>
                      </TableCell>
                      <TableCell>{t.note || "—"}</TableCell>
                      <TableCell>
                        {!t.voided && (
                          <Button variant="ghost" size="icon" title="Void" onClick={() => setVoidId(t.id)}>
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Stock Between Branches</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); transferMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {((products as any[]) || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">From</label>
                <Select value={fromBranchId} onValueChange={setFromBranchId}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">To</label>
                <Select value={toBranchId} onValueChange={setToBranchId}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedProduct && fromBranchId && (
              <p className="text-sm text-muted-foreground">
                Available at {branchName(fromBranchId)}: <strong>{availableFrom}</strong>
              </p>
            )}

            <div>
              <label className="text-sm text-muted-foreground">How many?</label>
              <Input type="number" min={1} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} required />
            </div>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={transferMutation.isPending}>{transferMutation.isPending ? "Saving..." : "Transfer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!voidId} onOpenChange={() => setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this transfer?</AlertDialogTitle>
            <AlertDialogDescription>This will reverse the stock movement. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => voidId && voidMutation.mutate(voidId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Void Transfer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
