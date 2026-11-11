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
import { Plus, Pencil, Package, Sparkles } from "lucide-react";
import { StockBadge, getProductStockLevel, fmt } from "@/lib/stock-helpers";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableTableHead } from "@/components/SortableTableHead";
import BulkProductForm from "@/components/BulkProductForm";
import { logAudit } from "@/lib/audit";
import { fetchBranches, fetchStockMap } from "@/lib/inventory";
import type { Tables } from "@/integrations/supabase/types";
import {
  ALL_MENU_CATEGORIES,
  DRINK_CATEGORIES,
  SNACK_CATEGORIES,
  getProductImage,
  seedAlKhairCatalog,
} from "@/lib/alkhair-menu";

const CATEGORY_ORDER: Record<string, number> = {
  "Signature Milkshake Series": 0,
  "Milk Series": 1,
  "Yoghurt Series": 2,
  "Fresh & Natural Series": 3,
  "Native Series": 4,
  "Healthy Series": 5,
  "Slush Series": 6,
  "Classic Snacks": 7,
  "Native Snacks": 8,
  "Ice Cream": 9,
};

type Product = Tables<"products">;

const emptyForm = {
  name: "",
  bottle_size: "50cl",
  category: "Signature Milkshake Series",
  selling_price: 0,
  is_active: true,
  vendor_id: null as string | null,
  commission_rate: 0,
};

type StockFilter = "all" | "available" | "low" | "finished";
type TypeFilter = "all" | "drinks" | "snacks";

export default function Products() {
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
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

  const syncMenuMutation = useMutation({
    mutationFn: async () => {
      return await seedAlKhairCatalog();
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      toast({
        title: "Menu Synced ✓",
        description: `Imported ${res.productsCount} products and ${res.rawMaterialsCount} raw materials with pictures!`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Sync error", description: err.message, variant: "destructive" });
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").order("name");
      return data || [];
    },
  });

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });
  const productIds = useMemo(() => (products as any[])?.map((p: any) => p.id) || [], [products]);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const stockByProduct = (id: string): Record<string, number> => {
    const m = stockMap?.get(id);
    if (!m || !(branches || []).length) return {};
    const out: Record<string, number> = {};
    for (const b of branches as any[]) out[b.code] = Number(m.get(b.id) ?? 0);
    if (Object.values(out).every((v) => v === 0)) {
      const p = (products as any[])?.find((x: any) => x.id === id) as any;
      if (p) {
        out["PROD"] = Number(p.production_stock ?? 0);
        out["SHOP"] = Number(p.shop_stock ?? 0);
        out["ONLINE"] = Number(p.online_shop_stock ?? 0);
      }
    }
    return out;
  };

  const enriched = useMemo(() => {
    if (!products || !stockMap) {
      return (products as any[])?.map((p: any) => ({
        ...p,
        _branch: stockByProduct(p.id),
        total_stock: Number(p.production_stock) + Number(p.shop_stock) + Number(p.online_shop_stock),
        stock_level: getProductStockLevel(Number(p.shop_stock) + Number(p.production_stock) + Number(p.online_shop_stock)),
      })) ?? [];
    }
    return (products as any[]).map((p: any) => {
      const bq = stockByProduct(p.id);
      const total = Object.values(bq).reduce((s, v) => s + Number(v), 0);
      const saleable = (bq["SHOP"] ?? 0) + (bq["ONLINE"] ?? 0) + (bq["PROD"] ?? 0);
      return { ...p, _branch: bq, total_stock: total, stock_level: getProductStockLevel(saleable) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stockMap, branches]);

  // Filtering
  const filtered = useMemo(() => {
    let list = enriched;
    if (stockFilter !== "all") list = list.filter(p => p.stock_level === stockFilter);
    if (typeFilter === "drinks") {
      list = list.filter(p => DRINK_CATEGORIES.includes(p.category) || !p.vendor_id);
    }
    if (typeFilter === "snacks") {
      list = list.filter(p => SNACK_CATEGORIES.includes(p.category) || !!p.vendor_id);
    }
    if (nameFilter) list = list.filter(p => p.name.toLowerCase().includes(nameFilter.toLowerCase()));
    return list;
  }, [enriched, stockFilter, typeFilter, nameFilter]);

  const { sort, toggleSort, sorted: tableSorted } = useSortableTable(filtered, { key: "", direction: null });

  const sorted = useMemo(() => {
    if (sort.key) return tableSorted;
    return [...filtered].sort((a: any, b: any) => {
      const catA = CATEGORY_ORDER[a.category] ?? 99;
      const catB = CATEGORY_ORDER[b.category] ?? 99;
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, sort.key, tableSorted]);

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      if (editing) {
        const { error } = await supabase.from("products").update(values).eq("id", editing.id);
        if (error) throw error;
        await logAudit({
          action_type: "edit",
          module: "products",
          record_id: editing.id,
          old_values: { name: editing.name, category: editing.category, selling_price: editing.selling_price },
          new_values: values,
        });
      } else {
        const { data, error } = await supabase.from("products").insert(values).select("id").single();
        if (error) throw error;
        if (data?.id) {
          await logAudit({ action_type: "create", module: "products", record_id: data.id, new_values: values });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: editing ? "Updated ✓" : "Added ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      bottle_size: p.bottle_size,
      category: p.category,
      selling_price: p.selling_price,
      is_active: p.is_active,
      vendor_id: (p as any).vendor_id || null,
      commission_rate: (p as any).commission_rate || 0,
    });
    setOpen(true);
  };

  const isEmptyMenu = !isLoading && (products || []).length === 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Products & Menu</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AL-KHAIR drinks, milkshakes, native series, snacks & ice cream catalog
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <Button
            variant="outline"
            onClick={() => syncMenuMutation.mutate()}
            disabled={syncMenuMutation.isPending}
            className="flex-1 sm:flex-none border-primary/40 hover:border-primary text-xs"
            title="Import/sync full Al-Khair menu (50 items) with photos"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
            {syncMenuMutation.isPending ? "Syncing..." : "Sync Full Menu"}
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="flex-1 sm:flex-none text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Multiple
          </Button>
          <Button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }} className="flex-1 sm:flex-none text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Product
          </Button>
        </div>
      </div>

      {/* Onboarding Banner when no products in database */}
      {isEmptyMenu && (
        <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/10 via-card to-background p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mx-auto shadow-inner">
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-extrabold text-foreground">
              Official AL-KHAIR Menu Ready to Import
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Your official menu has <strong>50 products</strong> across <strong>10 categories</strong> (Signature Milkshakes, Fresh Juices, Native Drinks, Slushes, Classic & Native Snacks, Ice Cream) ready with prices and photos.
            </p>
          </div>
          <Button
            size="default"
            onClick={() => syncMenuMutation.mutate()}
            disabled={syncMenuMutation.isPending}
            className="font-bold shadow-md hover:scale-103 transition-transform text-xs"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {syncMenuMutation.isPending ? "Importing Menu & Photos..." : "Load 50 Official Menu Items Now"}
          </Button>
        </Card>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <Input placeholder="Search product..." value={nameFilter} onChange={e => setNameFilter(e.target.value)} className="w-full sm:w-48 h-9 text-xs" />
        <div className="flex gap-1 flex-wrap">
          {(["all", "drinks", "snacks"] as TypeFilter[]).map(t => (
            <Button key={t} size="sm" variant={typeFilter === t ? "default" : "outline"} onClick={() => setTypeFilter(t)} className="capitalize text-xs h-9">
              {t === "all" ? "All Types" : t}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "available", "low", "finished"] as StockFilter[]).map(s => (
            <Button key={s} size="sm" variant={stockFilter === s ? "default" : "outline"} onClick={() => setStockFilter(s)} className="capitalize text-xs h-9">
              {s === "all" ? "All Stock" : s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading products...</p>
      ) : sorted.length === 0 && !isEmptyMenu ? (
        <p className="text-sm text-muted-foreground text-center py-8">No products match your filters</p>
      ) : (
        <>
          {/* Mobile list */}
          <MobileList>
            {sorted.map((p: any) => {
              const bq = p._branch || stockByProduct(p.id);
              const img = getProductImage(p.id, p.name);
              return (
                <MobileListItem
                  key={p.id}
                  avatarFallback={p.name}
                  avatarSrc={img}
                  supportingIcon={<Package className="h-3 w-3" />}
                  heading={p.name}
                  caption={`${p.bottle_size} · ${fmt(p.selling_price)} · ${p.category}`}
                  meta={`Prod ${bq["PROD"] ?? 0} · Shop ${bq["SHOP"] ?? 0} · Online ${bq["ONLINE"] ?? 0}`}
                  trailing={<Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">{p.is_active ? "Active" : "Off"}</Badge>}
                  actions={[{ id: "edit", label: "Edit product", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(p) }]}
                />
              );
            })}
          </MobileList>

          {/* Desktop table */}
          <div className="desktop-table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14 text-center">Photo</TableHead>
                        <SortableTableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                        <TableHead>Category</TableHead>
                        <TableHead>Size</TableHead>
                        <SortableTableHead label="Price" sortKey="selling_price" sort={sort} onToggle={toggleSort} />
                        <SortableTableHead label="Prod." sortKey="production_stock" sort={sort} onToggle={toggleSort} />
                        <SortableTableHead label="Shop" sortKey="shop_stock" sort={sort} onToggle={toggleSort} />
                        <SortableTableHead label="Online" sortKey="online_shop_stock" sort={sort} onToggle={toggleSort} />
                        <TableHead>Status</TableHead>
                        <SortableTableHead label="Cost" sortKey="average_cost_per_unit" sort={sort} onToggle={toggleSort} />
                        <TableHead>Margin</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((p: any) => {
                        const margin = p.selling_price - p.average_cost_per_unit;
                        const bq = p._branch || stockByProduct(p.id);
                        const img = getProductImage(p.id, p.name);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="p-2 text-center">
                              <img
                                src={img}
                                alt={p.name}
                                className="w-10 h-10 rounded-lg object-cover border border-border/80 mx-auto shadow-xs"
                                loading="lazy"
                              />
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">{p.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{p.category}</TableCell>
                            <TableCell className="text-xs">{p.bottle_size}</TableCell>
                            <TableCell className="font-bold">{fmt(p.selling_price)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <StockBadge level={getProductStockLevel(Number(bq["PROD"] ?? 0))} />
                                <span className="font-medium text-xs">{bq["PROD"] ?? 0}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <StockBadge level={getProductStockLevel(Number(bq["SHOP"] ?? 0))} />
                                <span className="font-medium text-xs">{bq["SHOP"] ?? 0}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <StockBadge level={getProductStockLevel(Number(bq["ONLINE"] ?? 0))} />
                                <span className="font-medium text-xs">{bq["ONLINE"] ?? 0}</span>
                              </div>
                            </TableCell>
                            <TableCell><Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">{p.is_active ? "Active" : "Off"}</Badge></TableCell>
                            <TableCell>{fmt(p.average_cost_per_unit)}</TableCell>
                            <TableCell className={margin >= 0 ? "text-emerald-600 font-semibold" : "text-destructive"}>{fmt(margin)}</TableCell>
                            <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Edit single product dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
            <Input placeholder="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={form.bottle_size} onValueChange={(v) => setForm({ ...form, bottle_size: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50cl">50cl</SelectItem>
                  <SelectItem value="35cl">35cl</SelectItem>
                  <SelectItem value="1L">1L</SelectItem>
                  <SelectItem value="cup">Cup</SelectItem>
                  <SelectItem value="cone">Cone</SelectItem>
                  <SelectItem value="pcs">Pcs</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                  <SelectItem value="portion">Portion</SelectItem>
                </SelectContent>
              </Select>
              {!form.vendor_id ? (
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    {ALL_MENU_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              )}
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
