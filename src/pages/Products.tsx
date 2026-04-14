import { useState, useMemo } from "react";
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
import { Plus, Pencil } from "lucide-react";
import { StockBadge, getProductStockLevel, fmt } from "@/lib/stock-helpers";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableTableHead } from "@/components/SortableTableHead";
import BulkProductForm from "@/components/BulkProductForm";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

const emptyForm = { name: "", bottle_size: "50cl", category: "milkshake", selling_price: 0, is_active: true, vendor_id: null as string | null, commission_rate: 0 };

type StockFilter = "all" | "available" | "low" | "finished";

export default function Products() {
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
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

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").order("name");
      return data || [];
    },
  });

  // Add computed total_stock for sorting
  const enriched = useMemo(() =>
    products?.map(p => ({
      ...p,
      total_stock: Number(p.production_stock) + Number(p.shop_stock) + Number(p.online_shop_stock),
      stock_level: getProductStockLevel(Number(p.shop_stock) + Number(p.production_stock) + Number(p.online_shop_stock)),
    })) ?? []
  , [products]);

  // Filtering
  const filtered = useMemo(() => {
    let list = enriched;
    if (stockFilter !== "all") list = list.filter(p => p.stock_level === stockFilter);
    if (nameFilter) list = list.filter(p => p.name.toLowerCase().includes(nameFilter.toLowerCase()));
    return list;
  }, [enriched, stockFilter, nameFilter]);

  const { sort, toggleSort, sorted } = useSortableTable(filtered, { key: "name", direction: "asc" });

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
    setForm({ name: p.name, bottle_size: p.bottle_size, category: p.category, selling_price: p.selling_price, is_active: p.is_active, vendor_id: (p as any).vendor_id || null, commission_rate: (p as any).commission_rate || 0 });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Products</h2>
        <Button onClick={() => setBulkOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
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

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                  <TableHead>Size</TableHead>
                  <SortableTableHead label="Price" sortKey="selling_price" sort={sort} onToggle={toggleSort} />
                  <SortableTableHead label="Prod. Stock" sortKey="production_stock" sort={sort} onToggle={toggleSort} />
                  <SortableTableHead label="Shop Stock" sortKey="shop_stock" sort={sort} onToggle={toggleSort} />
                  <SortableTableHead label="Online Stock" sortKey="online_shop_stock" sort={sort} onToggle={toggleSort} />
                  <TableHead>Status</TableHead>
                  <SortableTableHead label="Cost/Unit" sortKey="average_cost_per_unit" sort={sort} onToggle={toggleSort} />
                  <TableHead>Margin</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(p => {
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
                          <StockBadge level={getProductStockLevel(Number(p.online_shop_stock))} />
                          <span>{p.online_shop_stock}</span>
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
      )}

      {/* Edit single product dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
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
            <div>
              <label className="text-sm text-muted-foreground">Vendor (optional)</label>
              <Select value={form.vendor_id || "none"} onValueChange={(v) => {
                const vid = v === "none" ? null : v;
                const vendor = vendors?.find(vn => vn.id === vid);
                setForm({ ...form, vendor_id: vid, commission_rate: vendor ? vendor.default_commission_rate : 0 });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor (own product)</SelectItem>
                  {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.vendor_id && (
              <div>
                <label className="text-sm text-muted-foreground">Commission Rate (%)</label>
                <Input type="number" step="any" min={0} max={100} value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk add products */}
      <BulkProductForm open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}
