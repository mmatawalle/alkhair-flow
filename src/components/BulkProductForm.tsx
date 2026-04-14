import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

interface ProductRow {
  key: number;
  name: string;
  bottle_size: string;
  category: string;
  selling_price: number;
  vendor_id: string | null;
  commission_rate: number;
}

const makeRow = (key: number, defaults: Defaults): ProductRow => ({
  key,
  name: "",
  bottle_size: defaults.bottle_size,
  category: defaults.category,
  selling_price: 0,
  vendor_id: defaults.vendor_id,
  commission_rate: defaults.commission_rate,
});

interface Defaults {
  bottle_size: string;
  category: string;
  vendor_id: string | null;
  commission_rate: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function BulkProductForm({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [nextKey, setNextKey] = useState(2);

  const [defaults, setDefaults] = useState<Defaults>({
    bottle_size: "50cl",
    category: "milkshake",
    vendor_id: null,
    commission_rate: 0,
  });

  const [rows, setRows] = useState<ProductRow[]>([makeRow(1, defaults)]);

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const addRow = () => {
    setRows(prev => [...prev, makeRow(nextKey, defaults)]);
    setNextKey(k => k + 1);
  };

  const removeRow = (key: number) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const updateRow = (key: number, field: keyof ProductRow, value: any) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const applyDefaultsToAll = (newDefaults: Partial<Defaults>) => {
    const merged = { ...defaults, ...newDefaults };
    setDefaults(merged);
    // Apply to rows that still have the old default values
    setRows(prev => prev.map(r => ({
      ...r,
      ...(r.bottle_size === defaults.bottle_size ? { bottle_size: merged.bottle_size } : {}),
      ...(r.category === defaults.category ? { category: merged.category } : {}),
      ...(r.vendor_id === defaults.vendor_id ? { vendor_id: merged.vendor_id, commission_rate: merged.commission_rate } : {}),
    })));
  };

  const handleVendorDefault = (v: string) => {
    const vid = v === "none" ? null : v;
    const vendor = vendors?.find(vn => vn.id === vid);
    applyDefaultsToAll({ vendor_id: vid, commission_rate: vendor ? vendor.default_commission_rate : 0 });
  };

  const handleRowVendor = (key: number, v: string) => {
    const vid = v === "none" ? null : v;
    const vendor = vendors?.find(vn => vn.id === vid);
    setRows(prev => prev.map(r => r.key === key ? { ...r, vendor_id: vid, commission_rate: vendor ? vendor.default_commission_rate : 0 } : r));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valid = rows.filter(r => r.name.trim());
      if (!valid.length) throw new Error("Add at least one product with a name");
      const payload = valid.map(({ key, ...r }) => ({
        name: r.name,
        bottle_size: r.bottle_size,
        category: r.category,
        selling_price: r.selling_price,
        is_active: true,
        vendor_id: r.vendor_id,
        commission_rate: r.commission_rate,
      }));
      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: `${rows.filter(r => r.name.trim()).length} product(s) saved ✓` });
      resetAndClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAndClose = () => {
    setRows([makeRow(1, { bottle_size: "50cl", category: "milkshake", vendor_id: null, commission_rate: 0 })]);
    setDefaults({ bottle_size: "50cl", category: "milkshake", vendor_id: null, commission_rate: 0 });
    setNextKey(2);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Products</DialogTitle></DialogHeader>

        {/* Defaults section */}
        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Default values (apply to new rows)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Size</label>
              <Select value={defaults.bottle_size} onValueChange={v => applyDefaultsToAll({ bottle_size: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50cl">50cl</SelectItem>
                  <SelectItem value="35cl">35cl</SelectItem>
                  <SelectItem value="1L">1L</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Input className="h-8 text-xs" value={defaults.category} onChange={e => applyDefaultsToAll({ category: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vendor</label>
              <Select value={defaults.vendor_id || "none"} onValueChange={handleVendorDefault}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor</SelectItem>
                  {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {defaults.vendor_id && (
              <div>
                <label className="text-xs text-muted-foreground">Commission %</label>
                <Input className="h-8 text-xs" type="number" min={0} max={100} value={defaults.commission_rate} onChange={e => applyDefaultsToAll({ commission_rate: Number(e.target.value) })} />
              </div>
            )}
          </div>
        </div>

        {/* Product rows */}
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto] gap-2 items-start rounded-md border border-border p-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Input placeholder="Product name" className="h-8 text-xs" value={row.name} onChange={e => updateRow(row.key, "name", e.target.value)} />
                <Input placeholder="Price (₦)" type="number" className="h-8 text-xs" min={0} value={row.selling_price || ""} onChange={e => updateRow(row.key, "selling_price", Number(e.target.value))} />
                <Select value={row.bottle_size} onValueChange={v => updateRow(row.key, "bottle_size", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50cl">50cl</SelectItem>
                    <SelectItem value="35cl">35cl</SelectItem>
                    <SelectItem value="1L">1L</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Category" className="h-8 text-xs" value={row.category} onChange={e => updateRow(row.key, "category", e.target.value)} />
                <Select value={row.vendor_id || "none"} onValueChange={v => handleRowVendor(row.key, v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {row.vendor_id && (
                  <Input placeholder="Commission %" type="number" className="h-8 text-xs" min={0} max={100} value={row.commission_rate} onChange={e => updateRow(row.key, "commission_rate", Number(e.target.value))} />
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(row.key)} disabled={rows.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={addRow} className="w-fit">
          <Plus className="mr-1 h-3 w-3" /> Add Row
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : `Save All (${rows.filter(r => r.name.trim()).length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
