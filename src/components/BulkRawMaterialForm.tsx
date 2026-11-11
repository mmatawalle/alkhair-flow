import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { setMaterialImageFallback } from "@/lib/raw-material-images";

interface MaterialRow {
  key: number;
  name: string;
  purchase_unit: string;
  usage_unit: string;
  reorder_level: number;
  image_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function detectPresetImage(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  if (lower.includes("zobo") || lower.includes("hibiscus") || lower.includes("karkadeh")) {
    return "/presets/raw-materials/hibiscus_zobo.jpg";
  }
  if (lower.includes("ginger") || lower.includes("citta")) {
    return "/presets/raw-materials/ginger_root.jpg";
  }
  if (lower.includes("clove") || lower.includes("kanunfari")) {
    return "/presets/raw-materials/cloves_spice.jpg";
  }
  if (lower.includes("sugar") || lower.includes("sukari")) {
    return "/presets/raw-materials/granulated_sugar.jpg";
  }
  if (lower.includes("bottle") || lower.includes("pet")) {
    return "/presets/raw-materials/pet_bottles.jpg";
  }
  if (lower.includes("cap") || lower.includes("cover") || lower.includes("seal")) {
    return "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("label") || lower.includes("sticker")) {
    return "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("vanilla") || lower.includes("flavor") || lower.includes("essence")) {
    return "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("lemon") || lower.includes("lime") || lower.includes("citrus")) {
    return "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("honey")) {
    return "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("tiger") || lower.includes("aya")) {
    return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80";
  }
  if (lower.includes("date") || lower.includes("dabino")) {
    return "https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=500&q=80";
  }
  return null;
}

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

export default function BulkRawMaterialForm({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [nextKey, setNextKey] = useState(2);

  // Defaults
  const [defaultPurchaseUnit, setDefaultPurchaseUnit] = useState("bag");
  const [defaultUsageUnit, setDefaultUsageUnit] = useState("mudu");
  const [defaultReorderLevel, setDefaultReorderLevel] = useState(10);

  const makeRow = (key: number): MaterialRow => ({
    key,
    name: "",
    purchase_unit: defaultPurchaseUnit,
    usage_unit: defaultUsageUnit,
    reorder_level: defaultReorderLevel,
    image_url: null,
  });

  const [rows, setRows] = useState<MaterialRow[]>([makeRow(1)]);

  const addRow = () => {
    setRows(prev => [
      ...prev,
      {
        key: nextKey,
        name: "",
        purchase_unit: defaultPurchaseUnit,
        usage_unit: defaultUsageUnit,
        reorder_level: defaultReorderLevel,
        image_url: null,
      },
    ]);
    setNextKey(k => k + 1);
  };

  const removeRow = (key: number) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const updateRow = (key: number, field: keyof MaterialRow, value: any) => {
    setRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: value };
        if (field === "name" && !r.image_url) {
          const autoImg = detectPresetImage(value);
          if (autoImg) updated.image_url = autoImg;
        }
        return updated;
      })
    );
  };

  const handleDefaultPurchaseUnit = (v: string) => {
    setDefaultPurchaseUnit(v);
    setRows(prev => prev.map(r => ({ ...r, purchase_unit: v })));
  };

  const handleDefaultUsageUnit = (v: string) => {
    setDefaultUsageUnit(v);
    setRows(prev => prev.map(r => ({ ...r, usage_unit: v })));
  };

  const handleDefaultReorderLevel = (v: number) => {
    setDefaultReorderLevel(v);
    setRows(prev => prev.map(r => ({ ...r, reorder_level: v })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valid = rows.filter(r => r.name.trim());
      if (!valid.length) throw new Error("Add at least one material with a name");

      const payloadWithImage = valid.map(r => ({
        name: r.name.trim(),
        purchase_unit: r.purchase_unit,
        usage_unit: r.usage_unit,
        reorder_level: r.reorder_level,
        image_url: r.image_url || detectPresetImage(r.name) || null,
      }));

      let resultData: Array<{ id: string; name: string }> = [];

      // Try inserting with image_url
      let { data, error } = await supabase
        .from("raw_materials")
        .insert(payloadWithImage as any)
        .select("id, name");

      if (isMissingColumnError(error)) {
        // Fallback without image_url
        const payloadWithoutImage = valid.map(r => ({
          name: r.name.trim(),
          purchase_unit: r.purchase_unit,
          usage_unit: r.usage_unit,
          reorder_level: r.reorder_level,
        }));
        const res = await supabase
          .from("raw_materials")
          .insert(payloadWithoutImage)
          .select("id, name");
        if (res.error) throw res.error;
        resultData = res.data || [];
        // Save images to local fallback cache
        resultData.forEach((item, idx) => {
          const img = payloadWithImage[idx]?.image_url;
          if (img) setMaterialImageFallback(item.id, img);
        });
      } else if (error) {
        throw error;
      } else {
        resultData = data || [];
        resultData.forEach((item, idx) => {
          const img = payloadWithImage[idx]?.image_url;
          if (img) setMaterialImageFallback(item.id, img);
        });
      }

      for (const item of resultData) {
        await logAudit({ action_type: "create", module: "raw_materials", record_id: item.id, new_values: { name: item.name } });
      }
    },
    onSuccess: () => {
      const count = rows.filter(r => r.name.trim()).length;
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      toast({ title: `${count} material(s) saved ✓` });
      resetAndClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAndClose = () => {
    setDefaultPurchaseUnit("bag");
    setDefaultUsageUnit("mudu");
    setDefaultReorderLevel(10);
    setRows([makeRow(1)]);
    setNextKey(2);
    onOpenChange(false);
  };

  const validCount = rows.filter(r => r.name.trim()).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Add Multiple Raw Materials</span>
            <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> auto-photo matching
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Default Values */}
        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Default values for all rows</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Purchase Unit</label>
              <Input className="h-9 text-sm" value={defaultPurchaseUnit} onChange={e => handleDefaultPurchaseUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Usage Unit</label>
              <Input className="h-9 text-sm" value={defaultUsageUnit} onChange={e => handleDefaultUsageUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reorder Level</label>
              <Input className="h-9 text-sm" type="number" min={0} value={defaultReorderLevel} onChange={e => handleDefaultReorderLevel(Number(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Material Rows */}
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const detected = row.image_url || detectPresetImage(row.name);
            return (
              <div key={row.key} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center rounded-md border border-border p-2 bg-card">
                {/* Visual badge/thumbnail */}
                <div className="w-9 h-9 rounded-md border border-border/70 overflow-hidden bg-muted/40 shrink-0 flex items-center justify-center">
                  {detected ? (
                    <img src={detected} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      {row.name ? row.name.slice(0, 2) : `#${idx + 1}`}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <Input
                    placeholder={`e.g. Zobo, Ginger, Sugar ${idx + 1}`}
                    className="h-9 text-sm sm:col-span-2 md:col-span-1"
                    value={row.name}
                    onChange={e => updateRow(row.key, "name", e.target.value)}
                    autoFocus={idx === rows.length - 1}
                  />
                  <Input
                    placeholder="Purchase unit"
                    className="h-9 text-xs"
                    value={row.purchase_unit}
                    onChange={e => updateRow(row.key, "purchase_unit", e.target.value)}
                  />
                  <Input
                    placeholder="Usage unit"
                    className="h-9 text-xs"
                    value={row.usage_unit}
                    onChange={e => updateRow(row.key, "usage_unit", e.target.value)}
                  />
                  <Input
                    placeholder="Reorder"
                    type="number"
                    className="h-9 text-xs"
                    min={0}
                    value={row.reorder_level}
                    onChange={e => updateRow(row.key, "reorder_level", Number(e.target.value))}
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeRow(row.key)} disabled={rows.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" onClick={addRow} className="w-fit">
          <Plus className="mr-1 h-3 w-3" /> Add Row
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || validCount === 0}>
            {saveMutation.isPending ? "Saving..." : `Save All (${validCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
