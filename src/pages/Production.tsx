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
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";

interface MaterialUsage {
  raw_material_id: string;
  quantity_used: number;
}

export default function Production() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qtyProduced, setQtyProduced] = useState(0);
  const [prodDate, setProdDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [usages, setUsages] = useState<MaterialUsage[]>([]);
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
      const { data, error } = await supabase.from("production_batches").select("*, products(name, bottle_size)").order("production_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Calculate total batch cost from ACTUAL materials used
  const totalBatchCost = usages.reduce((sum, u) => {
    const mat = materials?.find(m => m.id === u.raw_material_id);
    return sum + (u.quantity_used * Number(mat?.average_cost_per_usage_unit || 0));
  }, 0);
  const costPerUnit = qtyProduced > 0 ? totalBatchCost / qtyProduced : 0;

  const batchMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Choose a product");
      if (qtyProduced <= 0) throw new Error("Enter quantity produced");
      if (usages.length === 0) throw new Error("Add materials used");

      // Validate all materials have stock
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

      // Insert batch
      const { data: batch, error: batchError } = await supabase.from("production_batches").insert({
        batch_code: batchCode,
        product_id: productId,
        quantity_produced: qtyProduced,
        production_date: prodDate,
        total_batch_cost: totalBatchCost,
        cost_per_unit: costPerUnit,
        note: note || null,
      }).select().single();
      if (batchError) throw batchError;

      // Insert batch items with actual costs
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
      const { error: itemsError } = await supabase.from("production_batch_items").insert(items);
      if (itemsError) throw itemsError;

      // Deduct raw materials
      for (const u of usages) {
        const mat = materials!.find(m => m.id === u.raw_material_id)!;
        const { error } = await supabase.from("raw_materials").update({
          current_stock: Number(mat.current_stock) - u.quantity_used,
        }).eq("id", mat.id);
        if (error) throw error;
      }

      // Update product stock and costs (weighted average)
      const product = products!.find(p => p.id === productId)!;
      const totalExisting = Number(product.production_stock) + Number(product.shop_stock);
      const oldAvg = Number(product.average_cost_per_unit);
      const newAvg = totalExisting > 0
        ? ((totalExisting * oldAvg) + totalBatchCost) / (totalExisting + qtyProduced)
        : costPerUnit;

      const { error: prodError } = await supabase.from("products").update({
        production_stock: Number(product.production_stock) + qtyProduced,
        latest_cost_per_unit: costPerUnit,
        average_cost_per_unit: newAvg,
      }).eq("id", productId);
      if (prodError) throw prodError;
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

  const resetForm = () => {
    setProductId(""); setQtyProduced(0); setNote(""); setUsages([]);
    setProdDate(new Date().toISOString().split("T")[0]);
  };

  const addUsage = () => setUsages([...usages, { raw_material_id: "", quantity_used: 0 }]);
  const removeUsage = (i: number) => setUsages(usages.filter((_, idx) => idx !== i));
  const updateUsage = (i: number, field: keyof MaterialUsage, value: any) => {
    const updated = [...usages];
    updated[i] = { ...updated[i], [field]: value };
    setUsages(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Production</h2>
        <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New Batch</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty Made</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Cost/Unit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : batches?.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>{b.production_date}</TableCell>
                  <TableCell className="font-mono text-xs">{b.batch_code}</TableCell>
                  <TableCell className="font-medium">{b.products?.name} ({b.products?.bottle_size})</TableCell>
                  <TableCell>{b.quantity_produced}</TableCell>
                  <TableCell>{fmt(b.total_batch_cost)}</TableCell>
                  <TableCell>{fmt(b.cost_per_unit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Production Batch</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); batchMutation.mutate(); }} className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">What are you making?</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>
                  {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">How many?</label>
                <Input type="number" min={1} value={qtyProduced || ""} onChange={(e) => setQtyProduced(Number(e.target.value))} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Date</label>
                <Input type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} />
              </div>
            </div>

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

            {usages.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <p>Total Cost: <strong>{fmt(totalBatchCost)}</strong></p>
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
    </div>
  );
}
