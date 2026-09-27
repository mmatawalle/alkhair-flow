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
import { Plus, Pencil, Trash2, Heart, Megaphone, Gift } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { logAudit } from "@/lib/audit";

const emptyReward = { name: "", points_cost: 0, reward_type: "discount", value_amount: "" as number | "", product_id: "none", is_active: true };

export default function LoyaltyRewards() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showReward, setShowReward] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [rewardForm, setRewardForm] = useState(emptyReward);
  const [ruleForm, setRuleForm] = useState<any>(null);
  const [excludeProduct, setExcludeProduct] = useState("");
  const [excludeCategory, setExcludeCategory] = useState("");
  const [showCampaign, setShowCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const todayStr = new Date().toISOString().slice(0,10);
  const emptyCampaign = { name: "", description: "", starts_at: todayStr, ends_at: "", multiplier: 2, condition_type: "none" as "none"|"min_spend"|"product_id"|"category", condition_value: "", is_active: true };
  const [campForm, setCampForm] = useState(emptyCampaign);

  const { data: rule } = useQuery({
    queryKey: ["loyalty_rule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_rules").select("*").eq("scope", "global").eq("is_active", true).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const activeRule = ruleForm || rule;
  const { data: rewards } = useQuery({
    queryKey: ["loyalty_rewards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_rewards").select("*, products(name)").order("points_cost");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, bottle_size, category").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: prodExcl } = useQuery({
    queryKey: ["loyalty_product_exclusions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_product_exclusions").select("product_id, products(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: catExcl } = useQuery({
    queryKey: ["loyalty_category_exclusions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_category_exclusions").select("category");
      if (error) throw error;
      return data;
    },
  });

  const { data: redemptions } = useQuery({
    queryKey: ["loyalty_redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_redemptions")
        .select("*, loyalty_customers(full_name, phone), loyalty_rewards(name), branches(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["loyalty_campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_campaigns").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error("No active rule found");
      const payload = {
        amount_per_point: Number(activeRule.amount_per_point),
        min_spend: Number(activeRule.min_spend),
        point_expiry_days: Number(activeRule.point_expiry_days),
        redemption_value_per_point: Number(activeRule.redemption_value_per_point),
        member_discount_percent: Number(activeRule.member_discount_percent ?? 5),
      };
      if (payload.amount_per_point <= 0) throw new Error("Amount per point must be > 0");
      if (payload.member_discount_percent < 0 || payload.member_discount_percent > 50) throw new Error("Member discount must be 0–50%");
      const { error } = await supabase.from("loyalty_rules").update(payload).eq("id", rule.id);
      if (error) throw error;
      await logAudit({ action_type: "update", module: "loyalty_rules", record_id: rule.id, new_values: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_rule"] });
      setRuleForm(null);
      toast({ title: "Rules updated ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveRewardMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: rewardForm.name.trim(),
        points_cost: Number(rewardForm.points_cost),
        reward_type: rewardForm.reward_type,
        value_amount: rewardForm.value_amount === "" ? null : Number(rewardForm.value_amount),
        product_id: rewardForm.product_id === "none" ? null : rewardForm.product_id,
        is_active: rewardForm.is_active,
      };
      if (!payload.name) throw new Error("Name is required");
      if (!Number.isInteger(payload.points_cost) || payload.points_cost <= 0) throw new Error("Points cost must be a positive whole number");
      if (editing) {
        const { error } = await supabase.from("loyalty_rewards").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("loyalty_rewards").insert(payload);
        if (error) throw error;
      }
      await logAudit({ action_type: editing ? "update" : "create", module: "loyalty_rewards", new_values: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_rewards"] });
      qc.invalidateQueries({ queryKey: ["loyalty_rewards_active"] });
      setShowReward(false);
      setEditing(null);
      setRewardForm(emptyReward);
      toast({ title: "Reward saved ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRewardMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_rewards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_rewards"] });
      toast({ title: "Reward deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (r: any) => {
    setEditing(r);
    setRewardForm({
      name: r.name,
      points_cost: r.points_cost,
      reward_type: r.reward_type,
      value_amount: r.value_amount ?? "",
      product_id: r.product_id || "none",
      is_active: r.is_active,
    });
    setShowReward(true);
  };

  const saveCampaignMutation = useMutation({
    mutationFn: async () => {
      const cond: any = {};
      if (campForm.condition_type === "min_spend" && campForm.condition_value) cond.min_spend = Number(campForm.condition_value);
      else if (campForm.condition_type === "product_id" && campForm.condition_value) cond.product_id = campForm.condition_value;
      else if (campForm.condition_type === "category" && campForm.condition_value) cond.category = campForm.condition_value;
      const payload = {
        name: campForm.name.trim(),
        description: campForm.description.trim() || null,
        starts_at: campForm.starts_at,
        ends_at: campForm.ends_at || null,
        multiplier: Number(campForm.multiplier),
        conditions: cond,
        is_active: campForm.is_active,
      };
      if (!payload.name) throw new Error("Campaign name required");
      if (payload.multiplier <= 1) throw new Error("Multiplier must be > 1 (e.g., 2 for double points)");
      if (editingCampaign) {
        const { error } = await supabase.from("loyalty_campaigns").update(payload).eq("id", editingCampaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("loyalty_campaigns").insert(payload);
        if (error) throw error;
      }
      await logAudit({ action_type: editingCampaign ? "update" : "create", module: "loyalty_campaigns", new_values: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_campaigns"] });
      setShowCampaign(false); setEditingCampaign(null); setCampForm(emptyCampaign);
      toast({ title: "Campaign saved ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty_campaigns"] }); toast({ title: "Campaign deleted ✓" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const openCampaignEdit = (c: any) => {
    setEditingCampaign(c);
    const cond = c.conditions as any;
    const type = cond?.min_spend ? "min_spend" : cond?.product_id ? "product_id" : cond?.category ? "category" : "none";
    const val = cond?.min_spend ? String(cond.min_spend) : cond?.product_id || cond?.category || "";
    setCampForm({ name: c.name, description: c.description || "", starts_at: c.starts_at.slice(0,10), ends_at: c.ends_at ? c.ends_at.slice(0,10) : "", multiplier: c.multiplier, condition_type: type as any, condition_value: val, is_active: c.is_active });
    setShowCampaign(true);
  };

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <h2 className="page-title">Rewards & Rules</h2>
        <Button onClick={() => { setEditing(null); setRewardForm(emptyReward); setShowReward(true); }} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />New Reward
        </Button>
      </div>

      {/* Points rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Points Rules (global)</CardTitle>
          <p className="text-xs text-muted-foreground">Member discount applies automatically to every sale with a loyalty customer attached (registration incentive).</p>
        </CardHeader>
        <CardContent>
          {activeRule ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="text-xs text-muted-foreground">Member discount (%)</label>
                <Input type="number" min={0} max={50} step="any" value={activeRule.member_discount_percent ?? 5} onChange={(e) => setRuleForm({ ...activeRule, member_discount_percent: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">₦ per 1 point</label>
                <Input type="number" min={1} value={activeRule.amount_per_point} onChange={(e) => setRuleForm({ ...activeRule, amount_per_point: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Minimum spend (₦)</label>
                <Input type="number" min={0} value={activeRule.min_spend} onChange={(e) => setRuleForm({ ...activeRule, min_spend: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Point expiry (days)</label>
                <Input type="number" min={1} value={activeRule.point_expiry_days} onChange={(e) => setRuleForm({ ...activeRule, point_expiry_days: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">₦ value per point</label>
                <Input type="number" min={0} step="any" value={activeRule.redemption_value_per_point} onChange={(e) => setRuleForm({ ...activeRule, redemption_value_per_point: Number(e.target.value) })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <Button size="sm" onClick={() => saveRuleMutation.mutate()} disabled={saveRuleMutation.isPending || !ruleForm}>
                  {saveRuleMutation.isPending ? "Saving..." : "Save Rules"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading rules...</p>
          )}
        </CardContent>
      </Card>

      {/* Rewards */}
      <MobileList>
        {((rewards as any[]) || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No rewards</p>
        ) : (
          (rewards as any[]).map((r: any) => (
            <MobileListItem
              key={r.id}
              avatarFallback={r.name}
              supportingIcon={<Heart className="h-3 w-3" />}
              heading={r.name}
              caption={`${r.points_cost} pts · ${r.reward_type.replace("_", " ")} · ${r.value_amount != null ? fmt(r.value_amount) : r.products?.name || "—"}`}
              trailing={<Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Off"}</Badge>}
              actions={[
                { id: "edit", label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => deleteRewardMutation.mutate(r.id), variant: "destructive" as const },
              ]}
            />
          ))
        )}
      </MobileList>
      <div className="desktop-table">
        <Card>
          <CardHeader><CardTitle className="text-base">Rewards</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((rewards as any[]) || []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.points_cost} pts</TableCell>
                  <TableCell className="capitalize">{r.reward_type.replace("_", " ")}</TableCell>
                  <TableCell>{r.value_amount != null ? fmt(r.value_amount) : r.products?.name || "—"}</TableCell>
                  <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Off"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteRewardMutation.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>

      {/* Exclusions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Products Excluded from Points</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Select value={excludeProduct} onValueChange={setExcludeProduct}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select product..." /></SelectTrigger>
                <SelectContent>
                  {(products || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!excludeProduct}
                onClick={async () => {
                  const { error } = await supabase.from("loyalty_product_exclusions").insert({ product_id: excludeProduct });
                  if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                  else {
                    qc.invalidateQueries({ queryKey: ["loyalty_product_exclusions"] });
                    setExcludeProduct("");
                    toast({ title: "Excluded ✓" });
                  }
                }}
              >
                Add
              </Button>
            </div>
            {((prodExcl as any[]) || []).map((e: any) => (
              <div key={e.product_id} className="flex justify-between text-sm rounded-lg border px-2 py-1.5">
                <span>{e.products?.name || e.product_id}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-destructive"
                  onClick={async () => {
                    await supabase.from("loyalty_product_exclusions").delete().eq("product_id", e.product_id);
                    qc.invalidateQueries({ queryKey: ["loyalty_product_exclusions"] });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Categories Excluded from Points</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Category name..." value={excludeCategory} onChange={(e) => setExcludeCategory(e.target.value)} />
              <Button
                size="sm"
                disabled={!excludeCategory.trim()}
                onClick={async () => {
                  const { error } = await supabase.from("loyalty_category_exclusions").insert({ category: excludeCategory.trim() });
                  if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                  else {
                    qc.invalidateQueries({ queryKey: ["loyalty_category_exclusions"] });
                    setExcludeCategory("");
                    toast({ title: "Excluded ✓" });
                  }
                }}
              >
                Add
              </Button>
            </div>
            {((catExcl as any[]) || []).map((e: any) => (
              <div key={e.category} className="flex justify-between text-sm rounded-lg border px-2 py-1.5">
                <span>{e.category}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-destructive"
                  onClick={async () => {
                    await supabase.from("loyalty_category_exclusions").delete().eq("category", e.category);
                    qc.invalidateQueries({ queryKey: ["loyalty_category_exclusions"] });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Campaigns */}
      <MobileList>
        {((campaigns as any[]) || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No campaigns</p>
        ) : (
          (campaigns as any[]).map((c: any) => (
            <MobileListItem
              key={c.id}
              avatarFallback={c.name}
              supportingIcon={<Megaphone className="h-3 w-3" />}
              heading={c.name}
              caption={`${c.starts_at.slice(0, 10)} → ${c.ends_at ? c.ends_at.slice(0, 10) : "∞"} · ×${c.multiplier} · ${!c.conditions || Object.keys(c.conditions).length === 0 ? "Global" : c.conditions.min_spend ? `Min spend ₦${c.conditions.min_spend}` : c.conditions.category ? `Category: ${c.conditions.category}` : "Product"}`}
              trailing={<Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Off"}</Badge>}
              actions={[
                { id: "edit", label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openCampaignEdit(c) },
                { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => deleteCampaignMutation.mutate(c.id), variant: "destructive" as const },
              ]}
            />
          ))
        )}
      </MobileList>
      <div className="desktop-table">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-base">Campaigns (double/triple points, etc.)</CardTitle>
            <Button size="sm" onClick={() => { setEditingCampaign(null); setCampForm(emptyCampaign); setShowCampaign(true); }}><Plus className="mr-1 h-3 w-3" />New Campaign</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Multiplier</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((campaigns as any[]) || []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}<div className="text-xs text-muted-foreground">{c.description || ""}</div></TableCell>
                  <TableCell className="text-xs">{c.starts_at.slice(0,10)} → {c.ends_at ? c.ends_at.slice(0,10) : "∞"}</TableCell>
                  <TableCell>×{c.multiplier}</TableCell>
                  <TableCell className="text-xs">{!c.conditions || Object.keys(c.conditions).length===0 ? "Global" : c.conditions.min_spend ? `Min spend ₦${c.conditions.min_spend}` : c.conditions.category ? `Category: ${c.conditions.category}` : c.conditions.product_id ? `Product` : JSON.stringify(c.conditions)}</TableCell>
                  <TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Off"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openCampaignEdit(c)}><Pencil className="h-3 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteCampaignMutation.mutate(c.id)}><Trash2 className="h-3 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!campaigns || (campaigns as any[]).length===0) && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground text-sm">No campaigns — e.g., double points this weekend: 2×, global, 2026-09-27 → 2026-09-28</TableCell></TableRow>}
            </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Redemptions */}
      <MobileList>
        {((redemptions as any[]) || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No redemptions</p>
        ) : (
          (redemptions as any[]).map((r: any) => (
            <MobileListItem
              key={r.id}
              avatarFallback={r.loyalty_customers?.full_name || r.loyalty_rewards?.name || "R"}
              supportingIcon={<Gift className="h-3 w-3" />}
              heading={r.loyalty_rewards?.name || "—"}
              caption={`${r.loyalty_customers?.full_name || "—"} · ${new Date(r.created_at).toLocaleDateString()}`}
              meta={`${r.branches?.name || "—"}`}
              trailing={<span className="text-destructive font-medium text-xs">-{r.points_spent} pts</span>}
              actions={[]}
            />
          ))
        )}
      </MobileList>
      <div className="desktop-table">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Redemptions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reward</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Branch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((redemptions as any[]) || []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{r.loyalty_customers?.full_name} <span className="text-muted-foreground text-xs">({r.loyalty_customers?.phone})</span></TableCell>
                  <TableCell>{r.loyalty_rewards?.name || "—"}</TableCell>
                  <TableCell className="text-destructive font-medium">-{r.points_spent}</TableCell>
                  <TableCell>{r.branches?.name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showCampaign} onOpenChange={setShowCampaign}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCampaign ? "Edit Campaign" : "New Campaign"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Campaign name *" value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} />
            <Input placeholder="Description (optional)" value={campForm.description} onChange={(e) => setCampForm({ ...campForm, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Starts</label><Input type="date" value={campForm.starts_at} onChange={(e) => setCampForm({ ...campForm, starts_at: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">Ends (leave empty = open)</label><Input type="date" value={campForm.ends_at} onChange={(e) => setCampForm({ ...campForm, ends_at: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Multiplier *</label><Input type="number" min={1.1} step={0.5} value={campForm.multiplier} onChange={(e) => setCampForm({ ...campForm, multiplier: Number(e.target.value) })} /><p className="text-xs text-muted-foreground">2 = double, 3 = triple</p></div>
              <div><label className="text-xs text-muted-foreground">Condition</label><Select value={campForm.condition_type} onValueChange={(v: any) => setCampForm({ ...campForm, condition_type: v, condition_value: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Global (all sales)</SelectItem><SelectItem value="min_spend">Min spend (e.g., ₦20k)</SelectItem><SelectItem value="category">Category</SelectItem><SelectItem value="product_id">Specific product</SelectItem></SelectContent></Select></div>
            </div>
            {campForm.condition_type === "min_spend" && <Input type="number" placeholder="Min spend ₦ (e.g., 20000)" value={campForm.condition_value} onChange={(e) => setCampForm({ ...campForm, condition_value: e.target.value })} />}
            {campForm.condition_type === "category" && <Input placeholder="Category name (exact, e.g., Signature Milkshakes)" value={campForm.condition_value} onChange={(e) => setCampForm({ ...campForm, condition_value: e.target.value })} />}
            {campForm.condition_type === "product_id" && <Select value={campForm.condition_value} onValueChange={(v) => setCampForm({ ...campForm, condition_value: v })}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{(products || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={campForm.is_active} onChange={(e) => setCampForm({ ...campForm, is_active: e.target.checked })} /> Active (earnings will × multiplier while active)</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaign(false)}>Cancel</Button>
            <Button onClick={() => saveCampaignMutation.mutate()} disabled={saveCampaignMutation.isPending}>{saveCampaignMutation.isPending ? "Saving..." : "Save Campaign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReward} onOpenChange={setShowReward}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Reward name *" value={rewardForm.name} onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Points cost *</label>
                <Input type="number" min={1} step={1} value={rewardForm.points_cost || ""} onChange={(e) => setRewardForm({ ...rewardForm, points_cost: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={rewardForm.reward_type} onValueChange={(v) => setRewardForm({ ...rewardForm, reward_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">Monetary discount</SelectItem>
                    <SelectItem value="free_product">Free product</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Discount value (₦, for discounts)</label>
                <Input
                  type="number"
                  min={0}
                  value={rewardForm.value_amount}
                  onChange={(e) => setRewardForm({ ...rewardForm, value_amount: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Free product</label>
                <Select value={rewardForm.product_id} onValueChange={(v) => setRewardForm({ ...rewardForm, product_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(products || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rewardForm.is_active} onChange={(e) => setRewardForm({ ...rewardForm, is_active: e.target.checked })} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReward(false)}>Cancel</Button>
            <Button onClick={() => saveRewardMutation.mutate()} disabled={saveRewardMutation.isPending}>
              {saveRewardMutation.isPending ? "Saving..." : "Save Reward"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
