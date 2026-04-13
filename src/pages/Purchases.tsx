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
import { Plus, Trash2, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const emptyForm = { raw_material_id: "", quantity_purchased: 0, purchase_unit: "", converted_quantity: 0, total_cost: 0, supplier: "", note: "", purchase_date: new Date().toISOString().split("T")[0] };

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [usedInProduction, setUsedInProduction] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: materials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchase_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_records").select("*, raw_materials(name, usage_unit)").order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedMaterial = materials?.find(m => m.id === form.raw_material_id);
  const costPerUsageUnit = form.converted_quantity > 0 ? form.total_cost / form.converted_quantity : 0;

  const checkUsedInProduction = async (materialId: string) => {
    const { count } = await supabase.from("production_batch_items").select("id", { count: "exact", head: true }).eq("raw_material_id", materialId);
    return (count ?? 0) > 0;
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setUsedInProduction(false);
    setOpen(true);
  };

  const openEdit = async (p: any) => {
    const used = await checkUsedInProduction(p.raw_material_id);
    setUsedInProduction(used);
    setEditId(p.id);
    setForm({
      raw_material_id: p.raw_material_id,
      quantity_purchased: p.quantity_purchased,
      purchase_unit: p.purchase_unit,
      converted_quantity: p.converted_quantity,
      total_cost: p.total_cost,
      supplier: p.supplier || "",
      note: p.note || "",
      purchase_date: p.purchase_date,
    });
    setOpen(true);
  };

  // Recalculate average cost from ALL purchase records for a material
  const recalcAvgCost = async (materialId: string, excludePurchaseId?: string) => {
    const { data } = await supabase.from("purchase_records").select("converted_quantity, total_cost").eq("raw_material_id", materialId);
    if (!data) return 0;
    const rows = excludePurchaseId ? data.filter((r: any) => r.id !== excludePurchaseId) : data;
    const totalQty = rows.reduce((s: number, r: any) => s + Number(r.converted_quantity), 0);
    const totalCost = rows.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
    return totalQty > 0 ? totalCost / totalQty : 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMaterial) throw new Error("Select a material");
      if (form.converted_quantity <= 0) throw new Error("Converted quantity must be > 0");
      if (form.total_cost <= 0) throw new Error("Total cost must be > 0");

      const mat = await supabase.from("raw_materials").select("*").eq("id", form.raw_material_id).single();
      if (mat.error) throw mat.error;
      const currentMat = mat.data;

      if (editId) {
        // EDIT: reverse old, apply new
        const oldPurchase = purchases?.find(p => p.id === editId);
        if (!oldPurchase) throw new Error("Purchase not found");

        const oldConv = Number(oldPurchase.converted_quantity);
        const newConv = form.converted_quantity;
        const stockDiff = newConv - oldConv;

        // If material changed, handle both old and new materials
        if (oldPurchase.raw_material_id !== form.raw_material_id) {
          // Reverse old material stock
          const oldMat = await supabase.from("raw_materials").select("*").eq("id", oldPurchase.raw_material_id).single();
          if (oldMat.data) {
            const oldMatStock = Math.max(0, Number(oldMat.data.current_stock) - oldConv);
            await supabase.from("raw_materials").update({ current_stock: oldMatStock }).eq("id", oldPurchase.raw_material_id);
          }
          // Add to new material
          const newStock = Number(currentMat.current_stock) + newConv;
          await supabase.from("raw_materials").update({ current_stock: newStock }).eq("id", form.raw_material_id);
        } else {
          // Same material: adjust stock by difference
          const newStock = Math.max(0, Number(currentMat.current_stock) + stockDiff);
          await supabase.from("raw_materials").update({ current_stock: newStock }).eq("id", form.raw_material_id);
        }

        // Update purchase record
        const { error } = await supabase.from("purchase_records").update({
          raw_material_id: form.raw_material_id,
          quantity_purchased: form.quantity_purchased,
          purchase_unit: form.purchase_unit,
          converted_quantity: form.converted_quantity,
          total_cost: form.total_cost,
          cost_per_usage_unit: costPerUsageUnit,
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          note: form.note || null,
        }).eq("id", editId);
        if (error) throw error;

        // Recalc avg cost for affected materials
        const newAvg = await recalcAvgCost(form.raw_material_id);
        await supabase.from("raw_materials").update({ average_cost_per_usage_unit: newAvg }).eq("id", form.raw_material_id);

        if (oldPurchase.raw_material_id !== form.raw_material_id) {
          const oldAvg = await recalcAvgCost(oldPurchase.raw_material_id);
          await supabase.from("raw_materials").update({ average_cost_per_usage_unit: oldAvg }).eq("id", oldPurchase.raw_material_id);
        }
      } else {
        // NEW purchase
        const { error: insertError } = await supabase.from("purchase_records").insert({
          raw_material_id: form.raw_material_id,
          quantity_purchased: form.quantity_purchased,
          purchase_unit: form.purchase_unit || currentMat.purchase_unit,
          converted_quantity: form.converted_quantity,
          total_cost: form.total_cost,
          cost_per_usage_unit: costPerUsageUnit,
          purchase_date: form.purchase_date,
          supplier: form.supplier || null,
          note: form.note || null,
        });
        if (insertError) throw insertError;

        const oldStock = Number(currentMat.current_stock);
        const oldAvg = Number(currentMat.average_cost_per_usage_unit);
        const newAvg = (oldStock * oldAvg + form.total_cost) / (oldStock + form.converted_quantity);

        await supabase.from("raw_materials").update({
          current_stock: oldStock + form.converted_quantity,
          average_cost_per_usage_unit: newAvg,
        }).eq("id", form.raw_material_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      toast({ title: editId ? "Purchase updated ✓" : "Purchase recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const purchase = purchases?.find(p => p.id === id);
      if (!purchase) throw new Error("Purchase not found");

      // Reverse stock
      const mat = await supabase.from("raw_materials").select("*").eq("id", purchase.raw_material_id).single();
      if (mat.data) {
        const newStock = Math.max(0, Number(mat.data.current_stock) - Number(purchase.converted_quantity));
        await supabase.from("raw_materials").update({ current_stock: newStock }).eq("id", mat.data.id);
      }

      const { error } = await supabase.from("purchase_records").delete().eq("id", id);
      if (error) throw error;

      // Recalc avg cost
      const newAvg = await recalcAvgCost(purchase.raw_material_id, id);
      await supabase.from("raw_materials").update({ average_cost_per_usage_unit: newAvg }).eq("id", purchase.raw_material_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setDeleteId(null);
      toast({ title: "Purchase deleted & stock reversed ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleDeleteClick = async (p: any) => {
    const used = await checkUsedInProduction(p.raw_material_id);
    setUsedInProduction(used);
    setDeleteId(p.id);
  };

  const fmt = (n: number) => `₦${Number(n).toLocaleString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Purchases</h2>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Record Purchase</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Qty Purchased</TableHead>
                <TableHead>Converted Qty</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Cost/Unit</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center">Loading...</TableCell></TableRow>
              ) : purchases?.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.purchase_date}</TableCell>
                  <TableCell className="font-medium">{p.raw_materials?.name}</TableCell>
                  <TableCell>{p.quantity_purchased} {p.purchase_unit}</TableCell>
                  <TableCell>{p.converted_quantity} {p.raw_materials?.usage_unit}</TableCell>
                  <TableCell>{fmt(p.total_cost)}</TableCell>
                  <TableCell>{fmt(p.cost_per_usage_unit)}</TableCell>
                  <TableCell>{p.supplier || "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(p)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Purchase" : "Record Purchase"}</DialogTitle></DialogHeader>

          {usedInProduction && editId && (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription>⚠️ This material has been used in production. Editing may affect production costs and stock.</AlertDescription>
            </Alert>
          )}

          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
            <Select value={form.raw_material_id} onValueChange={(v) => {
              const mat = materials?.find(m => m.id === v);
              setForm({ ...form, raw_material_id: v, purchase_unit: mat?.purchase_unit || "" });
            }}>
              <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
              <SelectContent>
                {materials?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Quantity Purchased</label>
                <Input type="number" step="any" min={0} value={form.quantity_purchased || ""} onChange={(e) => setForm({ ...form, quantity_purchased: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Purchase Unit</label>
                <Input value={form.purchase_unit} onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Converted Qty ({selectedMaterial?.usage_unit || "usage unit"})</label>
                <Input type="number" step="any" min={0} value={form.converted_quantity || ""} onChange={(e) => setForm({ ...form, converted_quantity: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total Cost (₦)</label>
                <Input type="number" step="any" min={0} value={form.total_cost || ""} onChange={(e) => setForm({ ...form, total_cost: Number(e.target.value) })} required />
              </div>
            </div>
            {costPerUsageUnit > 0 && (
              <p className="text-sm text-muted-foreground">Cost per {selectedMaterial?.usage_unit}: <strong>{fmt(costPerUsageUnit)}</strong></p>
            )}
            <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            <Input placeholder="Supplier (optional)" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editId ? "Update Purchase" : "Record Purchase"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be reversed and average cost recalculated. This cannot be undone.
              {usedInProduction && (
                <span className="block mt-2 font-semibold text-destructive">⚠️ This material has been used in production. Deleting may affect production cost accuracy.</span>
              )}
            </AlertDialogDescription>
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
