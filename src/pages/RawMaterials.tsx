import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Beaker,
  ZoomIn,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Camera,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { StockBadge, getStockLevel, fmt } from "@/lib/stock-helpers";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableTableHead } from "@/components/SortableTableHead";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { logAudit } from "@/lib/audit";
import BulkRawMaterialForm from "@/components/BulkRawMaterialForm";
import RawMaterialImagePicker from "@/components/RawMaterialImagePicker";
import { getMaterialImageFallback, setMaterialImageFallback } from "@/lib/raw-material-images";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RawMaterial = Tables<"raw_materials">;
type StockFilter = "all" | "available" | "low" | "finished";
type ViewMode = "grid" | "table";

function isMissingColumnError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    msg.includes("image_url") ||
    msg.includes("schema cache")
  );
}

const emptyForm = {
  name: "",
  purchase_unit: "bag",
  usage_unit: "mudu",
  current_stock: 0,
  average_cost_per_usage_unit: 0,
  reorder_level: 10,
  image_url: "" as string | null,
};

export default function RawMaterials() {
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inspectingMaterial, setInspectingMaterial] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("alkhair_raw_materials_view_mode");
      if (saved === "table" || saved === "grid") return saved;
    }
    return "grid";
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("alkhair_raw_materials_view_mode", mode);
    }
  };

  const { data: materials, isLoading } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return (data || []).map((m: any) => ({
        ...m,
        image_url: m.image_url || getMaterialImageFallback(m.id) || null,
      })) as RawMaterial[];
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

  const stats = useMemo(() => {
    const total = enriched.length;
    const available = enriched.filter(m => m.stock_level === "available").length;
    const low = enriched.filter(m => m.stock_level === "low").length;
    const finished = enriched.filter(m => m.stock_level === "finished").length;
    const withImages = enriched.filter(m => !!m.image_url).length;
    return { total, available, low, finished, withImages };
  }, [enriched]);

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const { current_stock: _stock, ...saveValues } = values;
      const imageUrl = saveValues.image_url || null;

      if (editing) {
        let { error } = await supabase.from("raw_materials").update(saveValues).eq("id", editing.id);
        if (isMissingColumnError(error)) {
          // If image_url column not yet applied to remote DB, save without column and cache locally
          const { image_url: _, ...withoutImage } = saveValues;
          const res = await supabase.from("raw_materials").update(withoutImage).eq("id", editing.id);
          if (res.error) throw res.error;
          setMaterialImageFallback(editing.id, imageUrl);
        } else if (error) {
          throw error;
        } else {
          setMaterialImageFallback(editing.id, imageUrl);
        }

        await logAudit({
          action_type: "edit",
          module: "raw_materials",
          record_id: editing.id,
          old_values: { name: editing.name, purchase_unit: editing.purchase_unit, usage_unit: editing.usage_unit },
          new_values: saveValues,
        });
      } else {
        let { data, error } = await supabase
          .from("raw_materials")
          .insert(saveValues as TablesInsert<"raw_materials">)
          .select("id")
          .single();

        if (isMissingColumnError(error)) {
          const { image_url: _, ...withoutImage } = saveValues;
          const res = await supabase
            .from("raw_materials")
            .insert(withoutImage as TablesInsert<"raw_materials">)
            .select("id")
            .single();
          if (res.error) throw res.error;
          data = res.data;
          if (data?.id) setMaterialImageFallback(data.id, imageUrl);
        } else if (error) {
          throw error;
        } else if (data?.id) {
          setMaterialImageFallback(data.id, imageUrl);
        }

        if (data?.id) {
          await logAudit({ action_type: "create", module: "raw_materials", record_id: data.id, new_values: saveValues });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: editing ? "Updated ✓" : "Added ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const mat = materials?.find(m => m.id === id);
      const { error } = await supabase.from("raw_materials").delete().eq("id", id);
      if (error) throw error;
      setMaterialImageFallback(id, null);
      await logAudit({ action_type: "delete", module: "raw_materials", record_id: id, old_values: mat ? { name: mat.name } : undefined });
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
    setForm({
      name: m.name,
      purchase_unit: m.purchase_unit,
      usage_unit: m.usage_unit,
      current_stock: m.current_stock,
      average_cost_per_usage_unit: m.average_cost_per_usage_unit,
      reorder_level: m.reorder_level,
      image_url: m.image_url || getMaterialImageFallback(m.id) || null,
    });
    setOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Raw Materials</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Visual inventory of ingredients, spices, and packaging materials
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />Add Multiple
          </Button>
          <Button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />Add Material
          </Button>
        </div>
      </div>

      {/* Quick Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Total Items
          </span>
          <div className="text-xl font-extrabold text-foreground mt-0.5">
            {stats.total}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({stats.withImages} with photos)
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
            Well Stocked
          </span>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
            {stats.available}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
            Low Stock
          </span>
          <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
            {stats.low}
          </div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider block">
            Out of Stock
          </span>
          <div className="text-xl font-extrabold text-destructive mt-0.5">
            {stats.finished}
          </div>
        </div>
      </div>

      {/* Filters & Layout View Mode Switcher */}
      <div className="filter-bar flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="Search material..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            className="w-full sm:w-56 h-9 text-xs"
          />
          <div className="flex gap-1 flex-wrap">
            {(["all", "available", "low", "finished"] as StockFilter[]).map(s => (
              <Button
                key={s}
                size="sm"
                variant={stockFilter === s ? "default" : "outline"}
                onClick={() => setStockFilter(s)}
                className="capitalize text-xs h-9 px-3"
              >
                {s === "all" ? "All" : s}
              </Button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle: Visual Cards (Default) vs Compact Table */}
        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1 shrink-0 self-end sm:self-auto">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "grid" ? "default" : "ghost"}
            onClick={() => handleSetViewMode("grid")}
            className="h-7 text-xs px-3 font-semibold flex items-center gap-1.5 shadow-none"
            title="Image-focused visual cards layout"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Visual Cards</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "table" ? "default" : "ghost"}
            onClick={() => handleSetViewMode("table")}
            className="h-7 text-xs px-3 font-semibold flex items-center gap-1.5 shadow-none"
            title="Compact tabular list"
          >
            <List className="h-3.5 w-3.5" />
            <span>Table</span>
          </Button>
        </div>
      </div>

      {/* Visual Cards Layout (Default Hero View - Images show more than names) */}
      {viewMode === "grid" ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-72 rounded-xl border border-border/60 bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl bg-card p-6">
              <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
              <h3 className="font-semibold text-foreground text-base">No raw materials match your filter</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Try clearing your search term or stock filter, or add a new raw material.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => { setStockFilter("all"); setNameFilter(""); }}
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {sorted.map((m) => {
                const needsReorder = m.stock_level !== "available";
                return (
                  <div
                    key={m.id}
                    className="group relative flex flex-col rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                  >
                    {/* Big Hero Photo Container - Visually commands the card */}
                    <div
                      onClick={() => setInspectingMaterial(m)}
                      className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40 cursor-pointer select-none"
                      title="Click to view full photo and details"
                    >
                      {m.image_url ? (
                        <>
                          <img
                            src={m.image_url}
                            alt={m.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
                            loading="lazy"
                          />
                          {/* Rich gradient overlay for contrast */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/35 opacity-75 group-hover:opacity-60 transition-opacity" />

                          {/* Hover action banner */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white text-xs font-semibold shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform">
                              <ZoomIn className="h-3.5 w-3.5 text-primary" /> Inspect Photo
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-b from-muted/30 to-muted/60">
                          <div className="w-12 h-12 rounded-xl bg-muted/80 border border-border/80 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:scale-105 transition-all mb-2">
                            <ImageIcon className="h-6 w-6 opacity-60" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">No Photo Attached</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(m);
                            }}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                          >
                            <Camera className="h-3 w-3" /> Add Image
                          </button>
                        </div>
                      )}

                      {/* Top Floating Badges */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        <div className="bg-background/85 backdrop-blur-md rounded-full shadow-sm p-0.5">
                          <StockBadge level={m.stock_level} />
                        </div>
                      </div>

                      {needsReorder && (
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-md">
                            <TrendingDown className="h-3 w-3" /> Reorder ≤ {m.reorder_level}
                          </span>
                        </div>
                      )}

                      {/* Material name anchored on image bottom */}
                      <div className="absolute bottom-2.5 left-3 right-3 z-10">
                        <h3
                          className="text-white text-base font-bold drop-shadow-md truncate"
                          title={m.name}
                        >
                          {m.name}
                        </h3>
                      </div>
                    </div>

                    {/* Card Body - Supporting Inventory Metrics */}
                    <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                            Current Stock
                          </span>
                          <div className="text-base font-extrabold text-foreground">
                            {m.current_stock}{" "}
                            <span className="text-xs font-semibold text-muted-foreground">
                              {m.usage_unit}
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                            Avg Cost
                          </span>
                          <div className="text-sm font-bold text-foreground">
                            {fmt(m.average_cost_per_usage_unit)}
                            <span className="text-[10px] font-normal text-muted-foreground">/{m.usage_unit}</span>
                          </div>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            Conversion: <strong className="text-foreground">{m.purchase_unit}</strong> → <strong className="text-foreground">{m.usage_unit}</strong>
                          </span>
                          <span>
                            Threshold: <strong className="text-foreground">{m.reorder_level}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setInspectingMaterial(m)}
                          className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground font-medium"
                        >
                          <ZoomIn className="h-3.5 w-3.5 mr-1" /> View Info
                        </Button>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(m)}
                            className="h-8 text-xs px-2.5 font-semibold"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(m.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete material"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile list (Shown in Table mode on small screens) */}
          <MobileList>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : sorted.map((m) => (
              <MobileListItem
                key={m.id}
                avatarFallback={m.name}
                avatarSrc={m.image_url || undefined}
                supportingIcon={<Beaker className="h-3 w-3" />}
                heading={m.name}
                caption={`${m.current_stock} ${m.usage_unit} · ${fmt(m.average_cost_per_usage_unit)}`}
                meta={`Reorder: ${m.reorder_level} ${m.usage_unit}`}
                trailing={<StockBadge level={m.stock_level} />}
                actions={[
                  { id: "preview", label: "Inspect Photo & Info", icon: <ZoomIn className="h-4 w-4" />, onClick: () => setInspectingMaterial(m) },
                  { id: "edit", label: "Edit Material & Photo", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(m) },
                  { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteId(m.id), variant: "destructive" },
                ]}
              />
            ))}
          </MobileList>

          {/* Desktop table (Shown in Table mode on larger screens) */}
          <div className="desktop-table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-16 text-center">Photo</TableHead>
                        <SortableTableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                        <SortableTableHead label="Stock" sortKey="current_stock" sort={sort} onToggle={toggleSort} />
                        <TableHead>Unit</TableHead>
                        <SortableTableHead label="Avg Cost" sortKey="average_cost_per_usage_unit" sort={sort} onToggle={toggleSort} />
                        <TableHead>Last Purchase</TableHead>
                        <SortableTableHead label="Reorder" sortKey="reorder_level" sort={sort} onToggle={toggleSort} />
                        <TableHead className="w-20 text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>
                      ) : sorted.map((m) => {
                        const needsReorder = m.stock_level !== "available";
                        return (
                          <TableRow key={m.id} className="hover:bg-muted/40 transition-colors">
                            <TableCell><StockBadge level={m.stock_level} /></TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => setInspectingMaterial(m)}
                                className="relative group mx-auto block w-12 h-12 rounded-lg overflow-hidden border border-border/80 bg-muted/40 hover:border-primary transition-all shrink-0 cursor-pointer shadow-xs"
                                title={m.image_url ? "Click to view photo" : "No photo (click to view)"}
                              >
                                {m.image_url ? (
                                  <>
                                    <img
                                      src={m.image_url}
                                      alt={m.name}
                                      className="w-full h-full object-cover group-hover:scale-115 transition-transform duration-200"
                                    />
                                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <ZoomIn className="h-4 w-4" />
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground group-hover:text-primary transition-colors">
                                    <span className="text-[11px] font-bold uppercase">{m.name.slice(0, 2)}</span>
                                  </div>
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">
                              {m.name}
                            </TableCell>
                            <TableCell className="font-bold">{m.current_stock} {m.usage_unit}</TableCell>
                            <TableCell className="text-muted-foreground">{m.purchase_unit} → {m.usage_unit}</TableCell>
                            <TableCell>{fmt(m.average_cost_per_usage_unit)}/{m.usage_unit}</TableCell>
                            <TableCell className="text-muted-foreground">{lastPurchases?.[m.id] || "—"}</TableCell>
                            <TableCell>
                              {needsReorder ? (
                                <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                                  Reorder now
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{m.reorder_level}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Edit material & photo">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteId(m.id)} title="Delete material">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
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

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Raw Material</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Material Name
              </label>
              <Input
                placeholder="e.g. Hibiscus Calyces (Zobo), Ginger, Granulated Sugar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Visual Photo Picker */}
            <RawMaterialImagePicker
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              materialName={form.name}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Purchase Unit
                </label>
                <Input
                  placeholder="e.g. bag, carton, kg"
                  value={form.purchase_unit}
                  onChange={(e) => setForm({ ...form, purchase_unit: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Usage Unit
                </label>
                <Input
                  placeholder="e.g. mudu, pcs, bottle, g"
                  value={form.usage_unit}
                  onChange={(e) => setForm({ ...form, usage_unit: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Current Stock (read-only)
                </label>
                <Input type="number" value={form.current_stock} disabled className="bg-muted" />
                <p className="text-[11px] text-muted-foreground mt-1">Use Stock Adjustments page to change stock</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Reorder Level ({form.usage_unit || "units"})
                </label>
                <Input
                  type="number"
                  step="any"
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
                  min={0}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail / Photo Lightbox Dialog */}
      <Dialog open={!!inspectingMaterial} onOpenChange={(v) => !v && setInspectingMaterial(null)}>
        <DialogContent className="max-w-lg sm:max-w-xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-4">
              <span className="truncate text-lg font-bold">{inspectingMaterial?.name}</span>
              {inspectingMaterial && (
                <StockBadge level={getStockLevel(Number(inspectingMaterial.current_stock), Number(inspectingMaterial.reorder_level))} />
              )}
            </DialogTitle>
          </DialogHeader>
          {inspectingMaterial && (
            <div className="space-y-4 pt-1">
              <div className="overflow-hidden rounded-xl border border-border bg-black/5 w-full aspect-[16/10] sm:h-72 flex items-center justify-center shadow-inner relative group">
                {inspectingMaterial.image_url ? (
                  <>
                    <img
                      src={inspectingMaterial.image_url}
                      alt={inspectingMaterial.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-xs">
                      <span className="font-semibold drop-shadow-sm">{inspectingMaterial.name}</span>
                      <span className="text-[11px] bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full font-mono">
                        {inspectingMaterial.current_stock} {inspectingMaterial.usage_unit}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 text-muted-foreground">
                    <ImageIcon className="h-14 w-14 mx-auto mb-2 opacity-30 text-primary" />
                    <p className="text-sm font-semibold text-foreground">No photo uploaded yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      Add a photo or select an ingredient preset for instant visual identification
                    </p>
                    <Button
                      size="sm"
                      variant="default"
                      className="mt-3 text-xs font-semibold"
                      onClick={() => {
                        const mat = inspectingMaterial;
                        setInspectingMaterial(null);
                        openEdit(mat);
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Photo Now
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-3 rounded-lg border border-border/60">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Current Stock</span>
                  <span className="font-bold text-foreground text-sm">
                    {inspectingMaterial.current_stock} {inspectingMaterial.usage_unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Average Cost</span>
                  <span className="font-bold text-foreground text-sm">
                    {fmt(inspectingMaterial.average_cost_per_usage_unit)}/{inspectingMaterial.usage_unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Unit Conversion</span>
                  <span className="font-medium text-foreground">
                    {inspectingMaterial.purchase_unit} → {inspectingMaterial.usage_unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Reorder Threshold</span>
                  <span className="font-medium text-foreground">
                    {inspectingMaterial.reorder_level} {inspectingMaterial.usage_unit}
                  </span>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const mat = inspectingMaterial;
                    setInspectingMaterial(null);
                    openEdit(mat);
                  }}
                  className="w-full sm:w-auto"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Material & Photo
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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

      <BulkRawMaterialForm open={bulkOpen} onOpenChange={setBulkOpen} />
    </div>
  );
}
