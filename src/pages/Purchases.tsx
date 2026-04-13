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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ raw_material_id: "", quantity_purchased: 0, purchase_unit: "", converted_quantity: 0, total_cost: 0, supplier: "", note: "", purchase_date: new Date().toISOString().split("T")[0] });
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

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMaterial) throw new Error("Select a material");
      if (form.converted_quantity <= 0) throw new Error("Converted quantity must be > 0");
      if (form.total_cost <= 0) throw new Error("Total cost must be > 0");

      const { error: insertError } = await supabase.from("purchase_records").insert({
        raw_material_id: form.raw_material_id, quantity_purchased: form.quantity_purchased,
        purchase_unit: form.purchase_unit || selectedMaterial.purchase_unit,
        converted_quantity: form.converted_quantity, total_cost: form.total_cost,
        cost_per_usage_unit: costPerUsageUnit, purchase_date: form.purchase_date,
        supplier: form.supplier || null, note: form.note || null,
      });
      if (insertError) throw insertError;

      const oldStock = Number(selectedMaterial.current_stock);
      const oldAvg = Number(selectedMaterial.average_cost_per_usage_unit);
      const newQty = form.converted_quantity;
      const newAvg = (oldStock * oldAvg + form.total_cost) / (oldStock + newQty);

      const { error: updateError } = await supabase.from("raw_materials").update({
        current_stock: oldStock + newQty, average_cost_per_usage_unit: newAvg,
      }).eq("id", selectedMaterial.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false);
      setForm({ raw_material_id: "", quantity_purchased: 0, purchase_unit: "", converted_quantity: 0, total_cost: 0, supplier: "", note: "", purchase_date: new Date().toISOString().split("T")[0] });
      toast({ title: "Purchase recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const purchase = purchases?.find(p => p.id === id);
      if (!purchase) throw new Error("Purchase not found");

      // Reverse stock addition
      const mat = materials?.find(m => m.id === purchase.raw_material_id);
      if (mat) {
        const newStock = Math.max(0, Number(mat.current_stock) - Number(purchase.converted_quantity));
        await supabase.from("raw_materials").update({ current_stock: newStock }).eq("id", mat.id);
      }

      const { error } = await supabase.from("purchase_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setDeleteId(null);
      toast({ title: "Purchase deleted & stock reversed ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const fmt = (n: number) => `₦${Number(n).toLocaleString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Purchases</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Purchase</Button>
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
                <TableHead>Cost/Usage Unit</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead></TableHead>
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
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Purchase</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); purchaseMutation.mutate(); }} className="space-y-3">
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
              <Button type="submit" disabled={purchaseMutation.isPending}>{purchaseMutation.isPending ? "Saving..." : "Record Purchase"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase?</AlertDialogTitle>
            <AlertDialogDescription>Stock will be reversed. This cannot be undone.</AlertDialogDescription>
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
