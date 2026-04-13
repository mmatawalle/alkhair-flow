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
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PurchaseItem {
  raw_material_id: string;
  quantity_purchased: number;
  purchase_unit: string;
  converted_quantity: number;
  total_cost: number;
  supplier: string;
  note: string;
}

const emptyItem = (): PurchaseItem => ({
  raw_material_id: "", quantity_purchased: 0, purchase_unit: "", converted_quantity: 0, total_cost: 0, supplier: "", note: "",
});

const editEmpty = { raw_material_id: "", quantity_purchased: 0, purchase_unit: "", converted_quantity: 0, total_cost: 0, supplier: "", note: "", purchase_date: new Date().toISOString().split("T")[0] };

export default function Purchases() {
  // Multi-add state
  const [addOpen, setAddOpen] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [defaultSupplier, setDefaultSupplier] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([emptyItem()]);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(editEmpty);
  const [usedInProduction, setUsedInProduction] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteUsed, setDeleteUsed] = useState(false);

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

  const getMaterial = (id: string) => materials?.find(m => m.id === id);
  const costPerUnit = (item: PurchaseItem) => item.converted_quantity > 0 ? item.total_cost / item.converted_quantity : 0;
  const fmt = (n: number) => `₦${Number(n).toLocaleString()}`;

  const checkUsedInProduction = async (materialId: string) => {
    const { count } = await supabase.from("production_batch_items").select("id", { count: "exact", head: true }).eq("raw_material_id", materialId);
    return (count ?? 0) > 0;
  };

  const recalcAvgCost = async (materialId: string, excludeId?: string) => {
    const { data } = await supabase.from("purchase_records").select("id, converted_quantity, total_cost").eq("raw_material_id", materialId);
    if (!data) return 0;
    const rows = excludeId ? data.filter((r: any) => r.id !== excludeId) : data;
    const totalQty = rows.reduce((s: number, r: any) => s + Number(r.converted_quantity), 0);
    const totalCost = rows.reduce((s: number, r: any) => s + Number(r.total_cost), 0);
    return totalQty > 0 ? totalCost / totalQty : 0;
  };

  // --- MULTI ADD ---
  const updateItem = (i: number, field: keyof PurchaseItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    if (field === "raw_material_id") {
      const mat = getMaterial(value);
      next[i].purchase_unit = mat?.purchase_unit || "";
    }
    setItems(next);
  };
  const addRow = () => setItems([...items, emptyItem()]);
  const removeRow = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const openAdd = () => {
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setDefaultSupplier("");
    setItems([emptyItem()]);
    setAddOpen(true);
  };

  const saveBatchMutation = useMutation({
    mutationFn: async () => {
      const valid = items.filter(it => it.raw_material_id && it.converted_quantity > 0 && it.total_cost > 0);
      if (valid.length === 0) throw new Error("Add at least one valid item");

      for (const item of valid) {
        const supplier = item.supplier || defaultSupplier || null;
        const cpu = costPerUnit(item);

        const { error } = await supabase.from("purchase_records").insert({
          raw_material_id: item.raw_material_id,
          quantity_purchased: item.quantity_purchased,
          purchase_unit: item.purchase_unit,
          converted_quantity: item.converted_quantity,
          total_cost: item.total_cost,
          cost_per_usage_unit: cpu,
          purchase_date: purchaseDate,
          supplier,
          note: item.note || null,
        });
        if (error) throw error;

        const mat = await supabase.from("raw_materials").select("*").eq("id", item.raw_material_id).single();
        if (mat.error) throw mat.error;
        const oldStock = Number(mat.data.current_stock);
        const oldAvg = Number(mat.data.average_cost_per_usage_unit);
        const newAvg = (oldStock * oldAvg + item.total_cost) / (oldStock + item.converted_quantity);

        await supabase.from("raw_materials").update({
          current_stock: oldStock + item.converted_quantity,
          average_cost_per_usage_unit: newAvg,
        }).eq("id", item.raw_material_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setAddOpen(false);
      toast({ title: `${items.filter(it => it.raw_material_id && it.converted_quantity > 0).length} purchase(s) recorded ✓` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // --- EDIT ---
  const openEdit = async (p: any) => {
    const used = await checkUsedInProduction(p.raw_material_id);
    setUsedInProduction(used);
    setEditId(p.id);
    setEditForm({
      raw_material_id: p.raw_material_id,
      quantity_purchased: p.quantity_purchased,
      purchase_unit: p.purchase_unit,
      converted_quantity: p.converted_quantity,
      total_cost: p.total_cost,
      supplier: p.supplier || "",
      note: p.note || "",
      purchase_date: p.purchase_date,
    });
    setEditOpen(true);
  };

  const editCostPerUnit = editForm.converted_quantity > 0 ? editForm.total_cost / editForm.converted_quantity : 0;
  const editMaterial = getMaterial(editForm.raw_material_id);

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editId || !editForm.raw_material_id) throw new Error("Invalid");
      if (editForm.converted_quantity <= 0 || editForm.total_cost <= 0) throw new Error("Quantity and cost must be > 0");

      const oldPurchase = purchases?.find(p => p.id === editId);
      if (!oldPurchase) throw new Error("Not found");

      const mat = await supabase.from("raw_materials").select("*").eq("id", editForm.raw_material_id).single();
      if (mat.error) throw mat.error;

      if (oldPurchase.raw_material_id !== editForm.raw_material_id) {
        const oldMat = await supabase.from("raw_materials").select("*").eq("id", oldPurchase.raw_material_id).single();
        if (oldMat.data) {
          await supabase.from("raw_materials").update({ current_stock: Math.max(0, Number(oldMat.data.current_stock) - Number(oldPurchase.converted_quantity)) }).eq("id", oldPurchase.raw_material_id);
        }
        await supabase.from("raw_materials").update({ current_stock: Number(mat.data.current_stock) + editForm.converted_quantity }).eq("id", editForm.raw_material_id);
      } else {
        const diff = editForm.converted_quantity - Number(oldPurchase.converted_quantity);
        await supabase.from("raw_materials").update({ current_stock: Math.max(0, Number(mat.data.current_stock) + diff) }).eq("id", editForm.raw_material_id);
      }

      const { error } = await supabase.from("purchase_records").update({
        raw_material_id: editForm.raw_material_id,
        quantity_purchased: editForm.quantity_purchased,
        purchase_unit: editForm.purchase_unit,
        converted_quantity: editForm.converted_quantity,
        total_cost: editForm.total_cost,
        cost_per_usage_unit: editCostPerUnit,
        purchase_date: editForm.purchase_date,
        supplier: editForm.supplier || null,
        note: editForm.note || null,
      }).eq("id", editId);
      if (error) throw error;

      const newAvg = await recalcAvgCost(editForm.raw_material_id);
      await supabase.from("raw_materials").update({ average_cost_per_usage_unit: newAvg }).eq("id", editForm.raw_material_id);

      if (oldPurchase.raw_material_id !== editForm.raw_material_id) {
        const oldAvg = await recalcAvgCost(oldPurchase.raw_material_id);
        await supabase.from("raw_materials").update({ average_cost_per_usage_unit: oldAvg }).eq("id", oldPurchase.raw_material_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setEditOpen(false);
      setEditId(null);
      toast({ title: "Purchase updated ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // --- DELETE ---
  const handleDeleteClick = async (p: any) => {
    const used = await checkUsedInProduction(p.raw_material_id);
    setDeleteUsed(used);
    setDeleteId(p.id);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const purchase = purchases?.find(p => p.id === id);
      if (!purchase) throw new Error("Not found");

      const mat = await supabase.from("raw_materials").select("*").eq("id", purchase.raw_material_id).single();
      if (mat.data) {
        await supabase.from("raw_materials").update({ current_stock: Math.max(0, Number(mat.data.current_stock) - Number(purchase.converted_quantity)) }).eq("id", mat.data.id);
      }

      const { error } = await supabase.from("purchase_records").delete().eq("id", id);
      if (error) throw error;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Purchases</h2>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Record Purchases</Button>
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
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(p)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MULTI-ADD DIALOG */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Purchases</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveBatchMutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Purchase Date</label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Default Supplier (optional)</label>
                <Input placeholder="Applies to items without supplier" value={defaultSupplier} onChange={e => setDefaultSupplier(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {items.map((item, i) => {
                const mat = getMaterial(item.raw_material_id);
                const cpu = costPerUnit(item);
                return (
                  <Card key={i} className="p-3 relative">
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => removeRow(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="col-span-2 md:col-span-1">
                        <label className="text-xs text-muted-foreground">Material</label>
                        <Select value={item.raw_material_id} onValueChange={v => updateItem(i, "raw_material_id", v)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {materials?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Qty Purchased</label>
                        <Input className="h-9 text-sm" type="number" step="any" min={0} value={item.quantity_purchased || ""} onChange={e => updateItem(i, "quantity_purchased", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Purchase Unit</label>
                        <Input className="h-9 text-sm" value={item.purchase_unit} onChange={e => updateItem(i, "purchase_unit", e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Converted Qty ({mat?.usage_unit || "unit"})</label>
                        <Input className="h-9 text-sm" type="number" step="any" min={0} value={item.converted_quantity || ""} onChange={e => updateItem(i, "converted_quantity", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Total Cost (₦)</label>
                        <Input className="h-9 text-sm" type="number" step="any" min={0} value={item.total_cost || ""} onChange={e => updateItem(i, "total_cost", Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Supplier</label>
                        <Input className="h-9 text-sm" placeholder="(uses default)" value={item.supplier} onChange={e => updateItem(i, "supplier", e.target.value)} />
                      </div>
                    </div>
                    {cpu > 0 && <p className="text-xs text-muted-foreground mt-1">Cost/{mat?.usage_unit || "unit"}: <strong>{fmt(cpu)}</strong></p>}
                  </Card>
                );
              })}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-3 w-3" />Add Item</Button>

            <DialogFooter>
              <Button type="submit" disabled={saveBatchMutation.isPending}>
                {saveBatchMutation.isPending ? "Saving..." : `Record ${items.filter(it => it.raw_material_id && it.converted_quantity > 0).length} Purchase(s)`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Purchase</DialogTitle></DialogHeader>
          {usedInProduction && (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription>⚠️ This material has been used in production. Editing may affect costs and stock.</AlertDescription>
            </Alert>
          )}
          <form onSubmit={e => { e.preventDefault(); editMutation.mutate(); }} className="space-y-3">
            <Select value={editForm.raw_material_id} onValueChange={v => {
              const mat = getMaterial(v);
              setEditForm({ ...editForm, raw_material_id: v, purchase_unit: mat?.purchase_unit || "" });
            }}>
              <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
              <SelectContent>{materials?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Qty Purchased</label>
                <Input type="number" step="any" min={0} value={editForm.quantity_purchased || ""} onChange={e => setEditForm({ ...editForm, quantity_purchased: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Purchase Unit</label>
                <Input value={editForm.purchase_unit} onChange={e => setEditForm({ ...editForm, purchase_unit: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Converted Qty ({editMaterial?.usage_unit || "unit"})</label>
                <Input type="number" step="any" min={0} value={editForm.converted_quantity || ""} onChange={e => setEditForm({ ...editForm, converted_quantity: Number(e.target.value) })} required />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Total Cost (₦)</label>
                <Input type="number" step="any" min={0} value={editForm.total_cost || ""} onChange={e => setEditForm({ ...editForm, total_cost: Number(e.target.value) })} required />
              </div>
            </div>
            {editCostPerUnit > 0 && <p className="text-sm text-muted-foreground">Cost/{editMaterial?.usage_unit}: <strong>{fmt(editCostPerUnit)}</strong></p>}
            <Input type="date" value={editForm.purchase_date} onChange={e => setEditForm({ ...editForm, purchase_date: e.target.value })} />
            <Input placeholder="Supplier (optional)" value={editForm.supplier} onChange={e => setEditForm({ ...editForm, supplier: e.target.value })} />
            <Input placeholder="Note (optional)" value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} />
            <DialogFooter>
              <Button type="submit" disabled={editMutation.isPending}>{editMutation.isPending ? "Saving..." : "Update Purchase"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be reversed and average cost recalculated. This cannot be undone.
              {deleteUsed && <span className="block mt-2 font-semibold text-destructive">⚠️ This material has been used in production. Deleting may affect cost accuracy.</span>}
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
