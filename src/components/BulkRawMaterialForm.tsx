import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/audit";

interface MaterialRow {
  key: number;
  name: string;
  purchase_unit: string;
  usage_unit: string;
  reorder_level: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
  });

  const [rows, setRows] = useState<MaterialRow[]>([makeRow(1)]);

  const addRow = () => {
    setRows(prev => [...prev, { key: nextKey, name: "", purchase_unit: defaultPurchaseUnit, usage_unit: defaultUsageUnit, reorder_level: defaultReorderLevel }]);
    setNextKey(k => k + 1);
  };

  const removeRow = (key: number) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const updateRow = (key: number, field: keyof MaterialRow, value: any) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
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
      const payload = valid.map(r => ({
        name: r.name.trim(),
        purchase_unit: r.purchase_unit,
        usage_unit: r.usage_unit,
        reorder_level: r.reorder_level,
      }));
      const { data, error } = await supabase.from("raw_materials").insert(payload).select("id, name");
      if (error) throw error;
      for (const item of data || []) {
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
        <DialogHeader><DialogTitle>Add Multiple Raw Materials</DialogTitle></DialogHeader>

        {/* Default Values */}
        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Default values for all rows</p>
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
          {rows.map((row, idx) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto] gap-2 items-start rounded-md border border-border p-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                <Input
                  placeholder={`Material name ${idx + 1}`}
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
          ))}
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
