import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Ban } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MaterialUsage {
  raw_material_id: string;
  quantity_used: number;
}

interface ProductEntry {
  product_id: string;
  quantity: number;
}

export default function Production() {
  const [open, setOpen] = useState(false);
  const [prodDate, setProdDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [usages, setUsages] = useState<MaterialUsage[]>([]);
  const [productEntries, setProductEntries] = useState<ProductEntry[]>([{ product_id: "", quantity: 0 }]);
  const [voidId, setVoidId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: materials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: batches, isLoading } = useQuery({
    queryKey: ["production_batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_batches")
        .select("*, products(name, bottle_size), production_batch_products(product_id, quantity_produced, products(name, bottle_size))")
        .order("production_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalBatchCost = usages.reduce((sum, u) => {
    const mat = materials?.find(m => m.id === u.raw_material_id);
    return sum + (u.quantity_used * Number(mat?.average_cost_per_usage_unit || 0));
  }, 0);
  const totalProductQty = productEntries.reduce((s, e) => s + e.quantity, 0);
  const costPerUnit = totalProductQty > 0 ? totalBatchCost / totalProductQty : 0;

  const batchMutation = useMutation({
    mutationFn: async () => {
      const validEntries = productEntries.filter(e => e.product_id && e.quantity > 0);
      if (validEntries.length === 0) throw new Error("Add at least one product");
      if (usages.length === 0) throw new Error("Add materials used");

      // Validate materials
      for (const u of usages) {
        if (!u.raw_material_id) throw new Error("Select all materials");
        if (u.quantity_used <= 0) throw new Error("Enter quantity for all materials");
        const mat = materials?.find(m => m.id === u.raw_material_id);
        if (!mat) throw new Error("Invalid material");
        if (u.quantity_used > Number(mat.current_stock)) {
          throw new Error(`Not enough ${mat.name}. Available: ${mat.current_stock} ${mat.usage_unit}`);
        }
      }

      const batchCode = `B-${Date.now().toString(36).toUpperCase()}`;
      const primaryProduct = validEntries[0];

      // Create batch (use first product as primary for backward compat)
      const { data: batch, error: batchError } = await supabase.from("production_batches").insert({
        batch_code: batchCode,
        product_id: primaryProduct.product_id,
        quantity_produced: totalProductQty,
        production_date: prodDate,
        total_batch_cost: totalBatchCost,
        cost_per_unit: costPerUnit,
        note: note || null,
      }).select().single();
      if (batchError) throw batchError;

      // Insert batch products (for multi-product tracking)
      if (validEntries.length > 0) {
        const batchProducts = validEntries.map(e => ({
          production_batch_id: batch.id,
          product_id: e.product_id,
          quantity_produced: e.quantity,
          cost_per_unit: costPerUnit,
        }));
        await supabase.from("production_batch_products").insert(batchProducts);
      }

      // Insert material items
      const items = usages.map(u => {
        const mat = materials!.find(m => m.id === u.raw_material_id)!;
        const unitCost = Number(mat.average_cost_per_usage_unit);
        return {
          production_batch_id: batch.id,
          raw_material_id: u.raw_material_id,
          quantity_used: u.quantity_used,
          unit_cost_used: unitCost,
          total_cost: u.quantity_used * unitCost,
        };
      });
      await supabase.from("production_batch_items").insert(items);

      // Deduct raw materials
      for (const u of usages) {
        const mat = materials!.find(m => m.id === u.raw_material_id)!;
        await supabase.from("raw_materials").update({
          current_stock: Number(mat.current_stock) - u.quantity_used,
        }).eq("id", mat.id);
      }

      // Update each product's production stock and cost
      for (const entry of validEntries) {
        const product = products!.find(p => p.id === entry.product_id)!;
        const totalExisting = Number(product.production_stock) + Number(product.shop_stock) + Number(product.online_shop_stock);
        const oldAvg = Number(product.average_cost_per_unit);
        const entryCost = costPerUnit * entry.quantity;
        const newAvg = totalExisting > 0
          ? ((totalExisting * oldAvg) + entryCost) / (totalExisting + entry.quantity)
          : costPerUnit;

        await supabase.from("products").update({
          production_stock: Number(product.production_stock) + entry.quantity,
          latest_cost_per_unit: costPerUnit,
          average_cost_per_unit: newAvg,
        }).eq("id", entry.product_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      resetForm();
      toast({ title: "Batch recorded ✓", description: "Materials deducted, stock updated." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const batch = batches?.find(b => b.id === id);
      if (!batch) throw new Error("Batch not found");

      await supabase.from("production_batches").update({ voided: true }).eq("id", id);

      // Restore raw materials
      const { data: batchItems } = await supabase.from("production_batch_items").select("*").eq("production_batch_id", id);
      if (batchItems) {
        for (const item of batchItems) {
          const mat = materials?.find(m => m.id === item.raw_material_id);
          if (mat) {
            await supabase.from("raw_materials").update({
              current_stock: Number(mat.current_stock) + Number(item.quantity_used),
            }).eq("id", mat.id);
          }
        }
      }

      // Check for multi-product batch
      const { data: batchProds } = await supabase.from("production_batch_products").select("*").eq("production_batch_id", id);
      if (batchProds && batchProds.length > 0) {
        for (const bp of batchProds) {
          const product = products?.find(p => p.id === bp.product_id);
          if (product) {
            await supabase.from("products").update({
              production_stock: Math.max(0, Number(product.production_stock) - Number(bp.quantity_produced)),
            }).eq("id", bp.product_id);
          }
        }
      } else {
        // Legacy single-product batch
        const product = products?.find(p => p.id === (batch as any).product_id);
        if (product) {
          await supabase.from("products").update({
            production_stock: Math.max(0, Number(product.production_stock) - Number(batch.quantity_produced)),
          }).eq("id", (batch as any).product_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setVoidId(null);
      toast({ title: "Batch voided ✓", description: "Materials restored, stock reversed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setProductEntries([{ product_id: "", quantity: 0 }]);
    setNote(""); setUsages([]);
    setProdDate(new Date().toISOString().split("T")[0]);
  };

  const addUsage = () => setUsages([...usages, { raw_material_id: "", quantity_used: 0 }]);
  const removeUsage = (i: number) => setUsages(usages.filter((_, idx) => idx !== i));
  const updateUsage = (i: number, field: keyof MaterialUsage, value: any) => {
    const updated = [...usages];
    updated[i] = { ...updated[i], [field]: value };
    setUsages(updated);
  };

  const addProductEntry = () => setProductEntries([...productEntries, { product_id: "", quantity: 0 }]);
  const removeProductEntry = (i: number) => setProductEntries(productEntries.filter((_, idx) => idx !== i));
  const updateProductEntry = (i: number, field: keyof ProductEntry, value: any) => {
    const updated = [...productEntries];
    updated[i] = { ...updated[i], [field]: value };
    setProductEntries(updated);
  };

  const getBatchProductsLabel = (b: any) => {
    if (b.production_batch_products && b.production_batch_products.length > 0) {
      return b.production_batch_products.map((bp: any) =>
        `${bp.products?.name} (${bp.products?.bottle_size}) × ${bp.quantity_produced}`
      ).join(", ");
    }
    return `${b.products?.name} (${b.products?.bottle_size})`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Production</h2>
        <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New Batch</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Batch</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead className="hidden md:table-cell">Cost/Unit</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
                ) : batches?.map((b: any) => (
                  <TableRow key={b.id} className={b.voided ? "opacity-40 line-through" : ""}>
                    <TableCell className="whitespace-nowrap">{b.production_date}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs">{b.batch_code}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate" title={getBatchProductsLabel(b)}>{getBatchProductsLabel(b)}</TableCell>
                    <TableCell>{b.quantity_produced}</TableCell>
                    <TableCell>{fmt(b.total_batch_cost)}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.voided ? "VOIDED" : fmt(b.cost_per_unit)}</TableCell>
                    <TableCell>
                      {!b.voided && (
                        <Button variant="ghost" size="icon" title="Void batch" onClick={() => setVoidId(b.id)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Production Batch</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); batchMutation.mutate(); }} className="space-y-4">

            {/* Products section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">What are you making?</label>
                <Button type="button" variant="outline" size="sm" onClick={addProductEntry}><Plus className="mr-1 h-3 w-3" />Add Product</Button>
              </div>
              {productEntries.map((entry, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={entry.product_id} onValueChange={(v) => updateProductEntry(i, "product_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                      <SelectContent>
                        {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Input type="number" min={1} placeholder="Qty" value={entry.quantity || ""} onChange={(e) => updateProductEntry(i, "quantity", Number(e.target.value))} />
                  </div>
                  {productEntries.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeProductEntry(i)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Date</label>
              <Input type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
            </div>

            {/* Materials section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Materials Used</label>
                <Button type="button" variant="outline" size="sm" onClick={addUsage}><Plus className="mr-1 h-3 w-3" />Add</Button>
              </div>
              {usages.length === 0 && (
                <p className="text-sm text-muted-foreground">Click "Add" to enter each material you used</p>
              )}
              {usages.map((u, i) => {
                const mat = materials?.find(m => m.id === u.raw_material_id);
                return (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={u.raw_material_id} onValueChange={(v) => updateUsage(i, "raw_material_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>
                          {materials?.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.current_stock} {m.usage_unit} left)</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      <Input type="number" step="any" min={0} placeholder={mat?.usage_unit || "qty"} value={u.quantity_used || ""} onChange={(e) => updateUsage(i, "quantity_used", Number(e.target.value))} />
                    </div>
                    <div className="w-24 text-sm text-muted-foreground pt-2">
                      {mat ? fmt(u.quantity_used * Number(mat.average_cost_per_usage_unit)) : "—"}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeUsage(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
            </div>

            {usages.length > 0 && totalProductQty > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p>Total Cost: <strong>{fmt(totalBatchCost)}</strong></p>
                <p>Total Units: <strong>{totalProductQty}</strong></p>
                <p>Cost per Unit: <strong>{fmt(costPerUnit)}</strong></p>
              </div>
            )}

            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <DialogFooter>
              <Button type="submit" disabled={batchMutation.isPending}>{batchMutation.isPending ? "Saving..." : "Record Batch"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!voidId} onOpenChange={() => setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this batch?</AlertDialogTitle>
            <AlertDialogDescription>This will restore raw materials and reverse production stock. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => voidId && voidMutation.mutate(voidId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Void Batch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
