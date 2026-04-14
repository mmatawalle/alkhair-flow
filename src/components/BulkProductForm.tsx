import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

type ProductType = "drink" | "snack";

const DRINK_CATEGORIES = ["Signature Milkshakes", "Fresh & Natural Series", "Native Series"];
const DRINK_SIZES = ["35cl", "50cl"];

interface ProductRow {
  key: number;
  name: string;
  bottle_size: string;
  category: string;
  selling_price: number;
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
  const [productType, setProductType] = useState<ProductType>("drink");

  // Snack defaults
  const [defaultVendorId, setDefaultVendorId] = useState<string | null>(null);
  const [defaultCommission, setDefaultCommission] = useState(10);

  const drinkDefaults = (): Omit<ProductRow, "key"> => ({
    name: "",
    bottle_size: "50cl",
    category: DRINK_CATEGORIES[0],
    selling_price: 0,
    vendor_id: null,
    commission_rate: 0,
  });

  const snackDefaults = (): Omit<ProductRow, "key"> => ({
    name: "",
    bottle_size: "",
    category: "Snacks",
    selling_price: 0,
    vendor_id: defaultVendorId,
    commission_rate: defaultCommission,
  });

  const makeRow = (key: number): ProductRow => ({
    key,
    ...(productType === "drink" ? drinkDefaults() : snackDefaults()),
  });

  const [rows, setRows] = useState<ProductRow[]>([makeRow(1)]);

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const handleTypeChange = (type: ProductType) => {
    setProductType(type);
    // Reset rows with new type defaults
    setNextKey(2);
    if (type === "drink") {
      setRows([{ key: 1, ...drinkDefaults() }]);
    } else {
      setRows([{ key: 1, ...snackDefaults() }]);
    }
  };

  const addRow = () => {
    const newRow = makeRow(nextKey);
    // For snacks, apply current defaults
    if (productType === "snack") {
      newRow.vendor_id = defaultVendorId;
      newRow.commission_rate = defaultCommission;
    }
    setRows(prev => [...prev, newRow]);
    setNextKey(k => k + 1);
  };

  const removeRow = (key: number) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const updateRow = (key: number, field: keyof ProductRow, value: any) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
  };

  const handleRowVendor = (key: number, v: string) => {
    const vid = v === "none" ? null : v;
    const vendor = vendors?.find(vn => vn.id === vid);
    setRows(prev => prev.map(r =>
      r.key === key ? { ...r, vendor_id: vid, commission_rate: vendor ? vendor.default_commission_rate : 0 } : r
    ));
  };

  const handleDefaultVendor = (v: string) => {
    const vid = v === "none" ? null : v;
    const vendor = vendors?.find(vn => vn.id === vid);
    const rate = vendor ? vendor.default_commission_rate : 10;
    setDefaultVendorId(vid);
    setDefaultCommission(rate);
    // Apply to rows that still have old default
    setRows(prev => prev.map(r => ({
      ...r,
      vendor_id: vid,
      commission_rate: rate,
    })));
  };

  const handleDefaultCommission = (rate: number) => {
    setDefaultCommission(rate);
    setRows(prev => prev.map(r => ({ ...r, commission_rate: rate })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valid = rows.filter(r => r.name.trim());
      if (!valid.length) throw new Error("Add at least one product with a name");
      const payload = valid.map(r => ({
        name: r.name,
        bottle_size: productType === "drink" ? r.bottle_size : "N/A",
        category: r.category,
        selling_price: r.selling_price,
        is_active: true,
        vendor_id: productType === "snack" ? r.vendor_id : null,
        commission_rate: productType === "snack" ? r.commission_rate : 0,
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
    setProductType("drink");
    setDefaultVendorId(null);
    setDefaultCommission(10);
    setRows([{ key: 1, ...drinkDefaults() }]);
    setNextKey(2);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Products</DialogTitle></DialogHeader>

        {/* Product Type Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Product Type:</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={productType === "drink" ? "default" : "outline"}
              onClick={() => handleTypeChange("drink")}
            >
              Drink
            </Button>
            <Button
              type="button"
              size="sm"
              variant={productType === "snack" ? "default" : "outline"}
              onClick={() => handleTypeChange("snack")}
            >
              Snack
            </Button>
          </div>
        </div>

        {/* Snack Defaults */}
        {productType === "snack" && (
          <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Default values for all rows</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Vendor</label>
                <Select value={defaultVendorId || "none"} onValueChange={handleDefaultVendor}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Commission %</label>
                <Input className="h-8 text-xs" type="number" min={0} max={100} value={defaultCommission} onChange={e => handleDefaultCommission(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {/* Product Rows */}
        <div className="space-y-2">
          {rows.map(row => (
            <div key={row.key} className="grid grid-cols-[1fr_auto] gap-2 items-start rounded-md border border-border p-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Input placeholder="Product name" className="h-8 text-xs" value={row.name} onChange={e => updateRow(row.key, "name", e.target.value)} />
                <Input placeholder="Price (₦)" type="number" className="h-8 text-xs" min={0} value={row.selling_price || ""} onChange={e => updateRow(row.key, "selling_price", Number(e.target.value))} />

                {productType === "drink" && (
                  <>
                    <Select value={row.bottle_size} onValueChange={v => updateRow(row.key, "bottle_size", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Size" /></SelectTrigger>
                      <SelectContent>
                        {DRINK_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={row.category} onValueChange={v => updateRow(row.key, "category", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {DRINK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </>
                )}

                {productType === "snack" && (
                  <>
                    <Input placeholder="Category" className="h-8 text-xs" value={row.category} onChange={e => updateRow(row.key, "category", e.target.value)} />
                    <Select value={row.vendor_id || "none"} onValueChange={v => handleRowVendor(row.key, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vendor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vendor</SelectItem>
                        {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Commission %" type="number" className="h-8 text-xs" min={0} max={100} value={row.commission_rate} onChange={e => updateRow(row.key, "commission_rate", Number(e.target.value))} />
                  </>
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
