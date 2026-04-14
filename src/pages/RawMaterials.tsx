import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { StockBadge, getStockLevel, fmt } from "@/lib/stock-helpers";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableTableHead } from "@/components/SortableTableHead";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RawMaterial = Tables<"raw_materials">;
type StockFilter = "all" | "available" | "low" | "finished";

const emptyForm = { name: "", purchase_unit: "bag", usage_unit: "mudu", current_stock: 0, average_cost_per_usage_unit: 0, reorder_level: 10 };

export default function RawMaterials() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: materials, isLoading } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: lastPurchases } = useQuery({
    queryKey: ["purchase_records", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_records").select("raw_material_id, purchase_date").order("purchase_date", { ascending: false });
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach(p => { if (!map[p.raw_material_id]) map[p.raw_material_id] = p.purchase_date; });
      return map;
    },
  });

  // Enrich with stock level
  const enriched = useMemo(() =>
    materials?.map(m => ({
      ...m,
      stock_level: getStockLevel(Number(m.current_stock), Number(m.reorder_level)),
    })) ?? []
  , [materials]);

  // Filter
  const filtered = useMemo(() => {
    let list = enriched;
    if (stockFilter !== "all") list = list.filter(m => m.stock_level === stockFilter);
    if (nameFilter) list = list.filter(m => m.name.toLowerCase().includes(nameFilter.toLowerCase()));
    return list;
  }, [enriched, stockFilter, nameFilter]);

  const { sort, toggleSort, sorted } = useSortableTable(filtered, { key: "name", direction: "asc" });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const { current_stock: _stock, ...saveValues } = values;
      if (editing) {
        const { error } = await supabase.from("raw_materials").update(saveValues).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("raw_materials").insert(saveValues as TablesInsert<"raw_materials">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
      toast({ title: editing ? "Updated ✓" : "Added ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("raw_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setDeleteId(null);
      toast({ title: "Deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({ name: m.name, purchase_unit: m.purchase_unit, usage_unit: m.usage_unit, current_stock: m.current_stock, average_cost_per_usage_unit: m.average_cost_per_usage_unit, reorder_level: m.reorder_level });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Raw Materials</h2>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Material</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search by name..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} className="w-48" />
        <div className="flex gap-1">
          {(["all", "available", "low", "finished"] as StockFilter[]).map(s => (
            <Button key={s} size="sm" variant={stockFilter === s ? "default" : "outline"} onClick={() => setStockFilter(s)} className="capitalize text-xs">
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <SortableTableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortableTableHead label="Stock" sortKey="current_stock" sort={sort} onToggle={toggleSort} />
                <TableHead>Unit</TableHead>
                <SortableTableHead label="Avg Cost" sortKey="average_cost_per_usage_unit" sort={sort} onToggle={toggleSort} />
                <TableHead>Last Purchase</TableHead>
                <SortableTableHead label="Reorder" sortKey="reorder_level" sort={sort} onToggle={toggleSort} />
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center">Loading...</TableCell></TableRow>
              ) : sorted.map((m) => {
                const needsReorder = m.stock_level !== "available";
                return (
                  <TableRow key={m.id}>
                    <TableCell><StockBadge level={m.stock_level} /></TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-semibold">{m.current_stock} {m.usage_unit}</TableCell>
                    <TableCell className="text-muted-foreground">{m.purchase_unit} → {m.usage_unit}</TableCell>
                    <TableCell>{fmt(m.average_cost_per_usage_unit)}/{m.usage_unit}</TableCell>
                    <TableCell className="text-muted-foreground">{lastPurchases?.[m.id] || "—"}</TableCell>
                    <TableCell>
                      {needsReorder ? (
                        <span className="text-xs text-amber-600 font-medium">Reorder now</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{m.reorder_level}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Raw Material</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Purchase Unit (e.g. bag)" value={form.purchase_unit} onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })} required />
              <Input placeholder="Usage Unit (e.g. mudu)" value={form.usage_unit} onChange={(e) => setForm({ ...form, usage_unit: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Current Stock (read-only)</label>
                <Input type="number" value={form.current_stock} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">Use Stock Adjustments page to change stock</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Reorder Level</label>
                <Input type="number" step="any" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} min={0} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this raw material?</AlertDialogTitle>
            <AlertDialogDescription>This will fail if the material is used in purchases or production records.</AlertDialogDescription>
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
