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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { oddsPercent } from "@/lib/spin";

const emptyPrize = {
  label: "", description: "", prize_type: "points", points_amount: 10,
  value_amount: "" as number | "", discount_percent: "" as number | "",
  weight: 10, max_wins: "" as number | "", color: "#0d7a5f", is_active: true,
};

export default function SpinAdmin() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const sb = supabase as any;
  const [showPrize, setShowPrize] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyPrize);

  const { data: wheels } = useQuery({
    queryKey: ["spin_wheels"],
    queryFn: async () => {
      const { data, error } = await sb.from("spin_wheels").select("*").order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });
  const wheel = (wheels as any[])?.find((w) => w.is_active) || (wheels as any[])?.[0];

  const { data: prizes } = useQuery({
    queryKey: ["spin_prizes", wheel?.id],
    queryFn: async () => {
      if (!wheel?.id) return [];
      const { data, error } = await sb.from("spin_prizes").select("*").eq("wheel_id", wheel.id).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!wheel?.id,
  });

  const { data: plays } = useQuery({
    queryKey: ["spin_plays", wheel?.id],
    queryFn: async () => {
      if (!wheel?.id) return [];
      const { data, error } = await sb
        .from("spin_plays")
        .select("*, spin_prizes(label), loyalty_customers(full_name, phone)")
        .eq("wheel_id", wheel.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!wheel?.id,
  });

  const totalWeight = ((prizes as any[]) || []).filter((p) => p.is_active).reduce((s, p) => s + Number(p.weight), 0);
  const usedByPrize = new Map<string, number>();
  for (const pl of (plays as any[]) || []) {
    if (pl.status === "pending" || pl.status === "claimed") {
      usedByPrize.set(pl.prize_id, (usedByPrize.get(pl.prize_id) || 0) + 1);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!wheel?.id) throw new Error("No wheel found");
      if (!form.label.trim()) throw new Error("Label is required");
      if (Number(form.weight) < 0) throw new Error("Odds weight must be >= 0");
      const payload = {
        wheel_id: wheel.id,
        label: form.label.trim().toUpperCase(),
        description: form.description.trim() || null,
        prize_type: form.prize_type,
        points_amount: form.prize_type === "points" ? Number(form.points_amount) || 0 : 0,
        value_amount: form.value_amount === "" ? null : Number(form.value_amount),
        discount_percent: form.discount_percent === "" ? null : Number(form.discount_percent),
        weight: Number(form.weight) || 0,
        max_wins: form.max_wins === "" ? null : Number(form.max_wins),
        color: form.color,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await sb.from("spin_prizes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const maxOrder = Math.max(0, ...((prizes as any[]) || []).map((p) => Number(p.sort_order) || 0));
        const { error } = await sb.from("spin_prizes").insert({ ...payload, sort_order: maxOrder + 1 });
        if (error) throw error;
      }
      await logAudit({ action_type: editing ? "update" : "create", module: "spin_prizes", new_values: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spin_prizes"] });
      setShowPrize(false);
      setEditing(null);
      setForm(emptyPrize);
      toast({ title: "Prize saved ✓ — odds & budgets updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("spin_prizes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spin_prizes"] });
      toast({ title: "Prize deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      label: p.label, description: p.description || "", prize_type: p.prize_type,
      points_amount: p.points_amount || 10, value_amount: p.value_amount ?? "",
      discount_percent: p.discount_percent ?? "", weight: p.weight,
      max_wins: p.max_wins ?? "", color: p.color || "#0d7a5f", is_active: p.is_active,
    });
    setShowPrize(true);
  };

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Spin & Win</h2>
          <p className="page-subtitle">
            Guests spin free, register to redeem. Odds = weight share · Budgets = max wins caps.
            Public game: <span className="font-mono">/spin</span>
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyPrize); setShowPrize(true); }}>
          <Plus className="mr-2 h-4 w-4" />New Prize
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Prizes — adjustable odds, capped budgets</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prize</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Odds</TableHead>
                <TableHead>Budget used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((prizes as any[]) || []).map((p: any) => {
                const used = usedByPrize.get(p.id) || 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: p.color }} />
                      {p.label}
                      <div className="text-xs font-normal text-muted-foreground">
                        {p.prize_type === "points" ? `${p.points_amount} pts` : p.prize_type === "discount" ? `${p.discount_percent || p.value_amount || ""} off` : p.prize_type.replace("_", " ")}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{p.prize_type.replace("_", " ")}</TableCell>
                    <TableCell>weight {p.weight} · {p.is_active ? `${oddsPercent(Number(p.weight), totalWeight).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell>{p.max_wins == null ? `${used} / ∞` : `${used} / ${p.max_wins}`}</TableCell>
                    <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Off"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent plays (verify vouchers at the till)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Prize</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((plays as any[]) || []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell>{s.spin_prizes?.label || "—"}</TableCell>
                  <TableCell className="text-xs">{s.loyalty_customers ? `${s.loyalty_customers.full_name} (${s.loyalty_customers.phone})` : <span className="text-muted-foreground">guest — not registered</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{s.voucher_code || "—"}</TableCell>
                  <TableCell><Badge variant={s.status === "claimed" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                </TableRow>
              ))}
              {(!plays || (plays as any[]).length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No spins yet — share /spin with customers.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showPrize} onOpenChange={setShowPrize}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Prize" : "New Prize"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Label on wheel * (e.g. 50 PTS)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Input placeholder="Description (shown under wheel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={form.prize_type} onValueChange={(v) => setForm({ ...form, prize_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="points">Points</SelectItem>
                    <SelectItem value="discount">Discount on products</SelectItem>
                    <SelectItem value="free_product">Free product (voucher)</SelectItem>
                    <SelectItem value="no_win">No win (try again)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Wheel color</label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
              </div>
            </div>
            {form.prize_type === "points" && (
              <div>
                <label className="text-xs text-muted-foreground">Points amount *</label>
                <Input type="number" min={1} value={form.points_amount} onChange={(e) => setForm({ ...form, points_amount: Number(e.target.value) })} />
              </div>
            )}
            {form.prize_type === "discount" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Discount % (e.g. 5)</label>
                  <Input type="number" min={0} max={100} value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value === "" ? "" : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Or ₦ value</label>
                  <Input type="number" min={0} value={form.value_amount} onChange={(e) => setForm({ ...form, value_amount: e.target.value === "" ? "" : Number(e.target.value) })} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Odds weight * (higher = more frequent)</label>
                <Input type="number" min={0} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Budget cap — max wins (empty = unlimited)</label>
                <Input type="number" min={1} placeholder="e.g. 50" value={form.max_wins} onChange={(e) => setForm({ ...form, max_wins: e.target.value === "" ? "" : Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrize(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Prize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
