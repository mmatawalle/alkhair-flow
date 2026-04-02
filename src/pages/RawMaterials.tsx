import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type RawMaterial = Tables<"raw_materials">;

const emptyForm = { name: "", purchase_unit: "bag", usage_unit: "mudu", current_stock: 0, average_cost_per_usage_unit: 0, reorder_level: 10 };

export default function RawMaterials() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm);
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

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      if (editing) {
        const { error } = await supabase.from("raw_materials").update(values).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("raw_materials").insert(values as TablesInsert<"raw_materials">);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: editing ? "Updated" : "Added", description: "Raw material saved." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({ name: m.name, purchase_unit: m.purchase_unit, usage_unit: m.usage_unit, current_stock: m.current_stock, average_cost_per_usage_unit: m.average_cost_per_usage_unit, reorder_level: m.reorder_level });
    setOpen(true);
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const stockStatus = (m: RawMaterial) => {
    if (m.current_stock <= m.reorder_level * 0.5) return <Badge variant="destructive">Low</Badge>;
    if (m.current_stock <= m.reorder_level) return <Badge variant="secondary">Medium</Badge>;
    return <Badge className="bg-green-100 text-green-800 border-green-200">High</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Raw Materials</h2>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Material</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Purchase Unit</TableHead>
                <TableHead>Usage Unit</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Avg Cost/Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
              ) : materials?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.purchase_unit}</TableCell>
                  <TableCell>{m.usage_unit}</TableCell>
                  <TableCell>{m.current_stock} {m.usage_unit}</TableCell>
                  <TableCell>₦{Number(m.average_cost_per_usage_unit).toLocaleString()}</TableCell>
                  <TableCell>{stockStatus(m)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
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
              <Input placeholder="Purchase Unit" value={form.purchase_unit} onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })} required />
              <Input placeholder="Usage Unit" value={form.usage_unit} onChange={(e) => setForm({ ...form, usage_unit: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Current Stock</label>
                <Input type="number" step="any" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: Number(e.target.value) })} min={0} />
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
    </div>
  );
}
