import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import { StockBadge, getProductStockLevel, fmt } from "@/lib/stock-helpers";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

const emptyForm = { name: "", bottle_size: "50cl", category: "milkshake", selling_price: 0, is_active: true };

export default function Products() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("category").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      if (editing) {
        const { error } = await supabase.from("products").update(values).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: "Saved ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, bottle_size: p.bottle_size, category: p.category, selling_price: p.selling_price, is_active: p.is_active });
    setOpen(true);
  };

  // Group by category
  const grouped = products?.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Products</h2>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">{category}s</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Prod. Stock</TableHead>
                  <TableHead>Shop Stock</TableHead>
                  <TableHead>Online Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead>Margin</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(p => {
                  const margin = p.selling_price - p.average_cost_per_unit;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.bottle_size}</TableCell>
                      <TableCell>{fmt(p.selling_price)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StockBadge level={getProductStockLevel(Number(p.production_stock))} />
                          <span>{p.production_stock}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StockBadge level={getProductStockLevel(Number(p.shop_stock))} />
                          <span>{p.shop_stock}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StockBadge level={getProductStockLevel(Number((p as any).online_shop_stock ?? 0))} />
                          <span>{(p as any).online_shop_stock ?? 0}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Off"}</Badge></TableCell>
                      <TableCell>{fmt(p.average_cost_per_unit)}</TableCell>
                      <TableCell className={margin >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(margin)}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Product</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <Input placeholder="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.bottle_size} onValueChange={(v) => setForm({ ...form, bottle_size: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50cl">50cl</SelectItem>
                  <SelectItem value="35cl">35cl</SelectItem>
                  <SelectItem value="1L">1L</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Selling Price (₦)</label>
              <Input type="number" step="any" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} min={0} required />
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
