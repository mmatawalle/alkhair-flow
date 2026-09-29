// @ts-nocheck -- references tables not yet in generated DB types
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
import { Plus, Copy, RefreshCw, Minus, Star, User, Eye, Share2 } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { fetchBranches } from "@/lib/inventory";
import { LoyaltyQR } from "@/components/LoyaltyQR";
import {
  fetchBalance, postLedgerEntry, redeemReward, registerCustomer, reissueIdentifier, sumLedgerBalance,
} from "@/lib/loyalty";

export default function LoyaltyCustomers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", birthday: "", branch_created_id: "", area: "", age_range: "", gender: "", marketing_consent: false });
  const [adjust, setAdjust] = useState({ points: "", reason: "" });
  const [redeemId, setRedeemId] = useState("");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });

  const { data: customers, isLoading } = useQuery({
    queryKey: ["loyalty_customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_customers").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: balances } = useQuery({
    queryKey: ["loyalty_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_points_ledger").select("customer_id, points");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data as any[]) || []) map.set(r.customer_id, (map.get(r.customer_id) || 0) + Number(r.points));
      return map;
    },
  });

  const { data: rewards } = useQuery({
    queryKey: ["loyalty_rewards_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_rewards").select("*").eq("is_active", true).order("points_cost");
      if (error) throw error;
      return data;
    },
  });

  const detail = customers?.find((c: any) => c.id === detailId) as any;

  const { data: detailBalance } = useQuery({
    queryKey: ["loyalty_balance", detailId],
    queryFn: () => fetchBalance(detailId!),
    enabled: !!detailId,
  });

  const { data: identifiers } = useQuery({
    queryKey: ["loyalty_identifiers", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data, error } = await supabase.from("loyalty_identifiers").select("*").eq("customer_id", detailId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!detailId,
  });

  const { data: ledger } = useQuery({
    queryKey: ["loyalty_ledger", detailId],
    queryFn: async () => {
      if (!detailId) return [];
      const { data, error } = await supabase
        .from("loyalty_points_ledger")
        .select("*, branches(name)")
        .eq("customer_id", detailId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!detailId,
  });

  const { data: custSales } = useQuery({
    queryKey: ["loyalty_sales", detailId],
    queryFn: async () => {
      if (!detailId) return { sales: [], items: [] as any[] };
      const { data: sales, error: sErr } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, total, status, branches(name)")
        .eq("customer_id", detailId)
        .order("sale_date", { ascending: false })
        .limit(100);
      if (sErr) throw sErr;
      const ids = ((sales as any[]) || []).map((s) => s.id);
      let items: any[] = [];
      if (ids.length) {
        const { data: it, error: iErr } = await supabase
          .from("sale_items")
          .select("quantity, line_total, product_id, products(name)")
          .in("sale_id", ids);
        if (iErr) throw iErr;
        items = it || [];
      }
      return { sales: (sales as any[]) || [], items };
    },
    enabled: !!detailId,
  });

  const registerMutation = useMutation({
    mutationFn: () => registerCustomer({
      full_name: form.full_name,
      phone: form.phone,
      email: form.email || null,
      birthday: form.birthday || null,
      branch_created_id: form.branch_created_id || null,
      area: form.area || null,
      age_range: form.age_range || null,
      gender: form.gender || null,
      marketing_consent: form.marketing_consent,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["loyalty_customers"] });
      setShowRegister(false);
      setForm({ full_name: "", phone: "", email: "", birthday: "", branch_created_id: "", area: "", age_range: "", gender: "", marketing_consent: false });
      toast({ title: "Customer registered ✓", description: `Card token: ${res.token}` });
      setDetailId(res.customer.id);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reissueMutation = useMutation({
    mutationFn: (identifierId: string) => reissueIdentifier(identifierId),
    onSuccess: (token) => {
      qc.invalidateQueries({ queryKey: ["loyalty_identifiers", detailId] });
      toast({ title: "New card issued ✓", description: `New token: ${token}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const adjustMutation = useMutation({
    mutationFn: () => {
      const pts = Number(adjust.points);
      if (!Number.isInteger(pts) || pts === 0) throw new Error("Enter a non-zero whole number of points");
      if (!adjust.reason.trim()) throw new Error("A reason is required for manual adjustments");
      return postLedgerEntry({ customer_id: detailId!, points: pts, entry_type: "adjust", reason: adjust.reason.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_ledger", detailId] });
      qc.invalidateQueries({ queryKey: ["loyalty_balances"] });
      setAdjust({ points: "", reason: "" });
      toast({ title: "Adjustment posted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const redeemMutation = useMutation({
    mutationFn: () => {
      if (!redeemId) throw new Error("Select a reward");
      return redeemReward({ customer_id: detailId!, reward_id: redeemId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty_ledger", detailId] });
      qc.invalidateQueries({ queryKey: ["loyalty_balances"] });
      setRedeemId("");
      toast({ title: "Reward redeemed ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = (customers as any[] || []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.full_name?.toLowerCase().includes(s) || c.phone?.includes(s) || c.handle?.toLowerCase().includes(s);
  });

  const copyToken = (token: string) => {
    navigator.clipboard?.writeText(token).catch(() => {});
    toast({ title: "Token copied", description: token });
  };

  // Detail stats
  const earned = sumLedgerBalance(((ledger as any[]) || []).filter((e) => e.entry_type === "earn"));
  const redeemed = -sumLedgerBalance(((ledger as any[]) || []).filter((e) => e.entry_type === "redeem"));
  const completedSales = ((custSales?.sales as any[]) || []).filter((s) => s.status !== "voided");
  const lifetimeSpend = completedSales.reduce((s, r) => s + Number(r.total), 0);
  const favProducts = (() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const i of custSales?.items || []) {
      const cur = map.get(i.product_id) || { name: i.products?.name || "Unknown", qty: 0, total: 0 };
      cur.qty += Number(i.quantity);
      cur.total += Number(i.line_total);
      map.set(i.product_id, cur);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  })();

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Loyalty Customers</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => {
              const base = import.meta.env.BASE_URL || "/";
              const url = window.location.origin + (base.endsWith("/") ? base : base + "/") + "join";
              navigator.clipboard?.writeText(url).then(
                () => toast({ title: "Join link copied", description: url }),
                () => toast({ title: "Join link", description: url }),
              );
            }}
          >
            <Share2 className="mr-2 h-4 w-4" />Join link
          </Button>
          <Button onClick={() => setShowRegister(true)} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />Register Customer
          </Button>
        </div>
      </div>

      <div className="filter-bar">
        <Input
          placeholder="Search name, phone or member ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No customers</p>
        ) : (
          filtered.map((c: any) => (
            <MobileListItem
              key={c.id}
              avatarFallback={c.full_name || c.phone}
              supportingIcon={<User className="h-3 w-3" />}
              heading={c.full_name}
              caption={c.handle ? `${c.phone} · ${c.handle}` : c.phone}
              meta={<span className="capitalize">{c.tier} · {c.status}</span>}
              trailing={<Badge variant="outline" className="text-xs shrink-0">{balances?.get(c.id) || 0} pts</Badge>}
              actions={[
                { id: "view", label: "View details", icon: <Eye className="h-4 w-4" />, onClick: () => setDetailId(c.id) },
              ]}
            />
          ))
        )}
      </MobileList>

      <div className="desktop-table">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                  ) : (
                    filtered.map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                        <TableCell className="font-medium">{c.full_name}</TableCell>
                        <TableCell className="font-mono text-xs">{c.handle || "—"}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell className="capitalize">{c.tier}</TableCell>
                        <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                        <TableCell><strong>{balances?.get(c.id) || 0}</strong> pts</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Register */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Customer</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Name + phone only — new members automatically get the member discount at checkout.</p>
          <div className="space-y-3">
            <Input placeholder="Full name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input placeholder="Phone number *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div>
              <label className="text-sm text-muted-foreground">Birthday (optional)</label>
              <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Area / location (optional)</label>
                <Input placeholder="e.g. Bodija, Dugbe..." value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Age range (optional)</label>
                <Select value={form.age_range || "__none"} onValueChange={(v) => setForm({ ...form, age_range: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Prefer not to say</SelectItem>
                    <SelectItem value="Under 18">Under 18</SelectItem>
                    <SelectItem value="18-24">18–24</SelectItem>
                    <SelectItem value="25-34">25–34</SelectItem>
                    <SelectItem value="35-44">35–44</SelectItem>
                    <SelectItem value="45-54">45–54</SelectItem>
                    <SelectItem value="55+">55+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Gender (optional)</label>
                <Select value={form.gender || "__none"} onValueChange={(v) => setForm({ ...form, gender: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Prefer not to say</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Registered at branch</label>
                <Select value={form.branch_created_id} onValueChange={(v) => setForm({ ...form, branch_created_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {(branches || []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />
              <span>Customer consents to marketing messages and to using area/age for purchase insights.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending || !form.full_name.trim() || !form.phone.trim()}
            >
              {registerMutation.isPending ? "Registering..." : "Register + Issue Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.full_name}
                  <Badge variant="outline" className="capitalize">{detail.tier}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Balance" value={`${detailBalance ?? balances?.get(detail.id) ?? 0} pts`} />
                  <Stat label="Visits" value={String(completedSales.length)} />
                  <Stat label="Lifetime spend" value={fmt(lifetimeSpend)} />
                  <Stat label="Avg. ticket" value={fmt(completedSales.length ? lifetimeSpend / completedSales.length : 0)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {detail.handle && <span className="font-mono font-semibold text-foreground">{detail.handle} · </span>}
                  {detail.phone} {detail.email ? `· ${detail.email}` : ""} {detail.birthday ? `· 🎂 ${detail.birthday}` : ""}
                  {detail.area ? ` · 📍 ${detail.area}` : ""}{detail.age_range ? ` · ${detail.age_range}` : ""}{detail.gender ? ` · ${detail.gender}` : ""}
                  {" · "}Earned {earned} · Redeemed {redeemed}
                  {completedSales.length ? ` · Last purchase ${completedSales[0].sale_date}` : " · No purchases yet"}
                </p>

                {/* Cards / identifiers */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Loyalty Cards / QR Tokens</CardTitle>
                    <p className="text-xs text-muted-foreground">Print-ready QR — token contains no PII; cards are interchangeable and reassignable. Lost card: Reissue deactivates old and issues new, history stays on account.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(identifiers || []).map((t: any) => (
                      <div key={t.id} className="flex flex-col sm:flex-row items-center gap-4 rounded-lg border p-3">
                        <div className="shrink-0">
                          {t.status === "active" ? (
                            <LoyaltyQR token={t.token} customerName={detail.full_name} phone={detail.phone} size={140} />
                          ) : (
                            <div className="flex h-[140px] w-[140px] items-center justify-center rounded-xl border bg-muted text-xs text-muted-foreground">Deactivated</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-center sm:text-left">
                          <p className="font-mono text-sm font-semibold tracking-widest">{t.token}</p>
                          <p className="text-xs text-muted-foreground capitalize">{t.type} · {t.status}</p>
                          <div className="mt-2 flex gap-1 justify-center sm:justify-start">
                            <Button variant="ghost" size="sm" onClick={() => copyToken(t.token)}>
                              <Copy className="mr-1 h-3.5 w-3.5" />Copy
                            </Button>
                            {t.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Mark lost & issue new card"
                                onClick={() => reissueMutation.mutate(t.id)}
                                disabled={reissueMutation.isPending}
                              >
                                <RefreshCw className="mr-1 h-3.5 w-3.5" />Reissue (lost)
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!identifiers || identifiers.length === 0) && <p className="text-sm text-muted-foreground">No card yet — registration issues one automatically.</p>}
                  </CardContent>
                </Card>

                {/* Redeem */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4" />Redeem Reward</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Select value={redeemId} onValueChange={setRedeemId}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select reward..." /></SelectTrigger>
                        <SelectContent>
                          {(rewards || []).map((r: any) => (
                            <SelectItem key={r.id} value={r.id}>{r.name} — {r.points_cost} pts</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => redeemMutation.mutate()} disabled={redeemMutation.isPending || !redeemId}>
                        {redeemMutation.isPending ? "..." : "Redeem"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Manual adjustment */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Minus className="h-4 w-4" />Manual Adjustment</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="number"
                        step={1}
                        className="sm:w-32"
                        placeholder="+/- pts"
                        value={adjust.points}
                        onChange={(e) => setAdjust({ ...adjust, points: e.target.value })}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Reason (required, audit-logged)"
                        value={adjust.reason}
                        onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
                      />
                      <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>Post</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Favourites */}
                {favProducts.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Favourite Products</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      {favProducts.map((f) => (
                        <div key={f.name} className="flex justify-between text-sm">
                          <span>{f.name}</span>
                          <span className="text-muted-foreground">{f.qty} units · {fmt(f.total)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Ledger */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Points History</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Points</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {((ledger as any[]) || []).map((e: any) => (
                          <TableRow key={e.id}>
                            <TableCell className="whitespace-nowrap">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                            <TableCell className="capitalize">{e.entry_type}</TableCell>
                            <TableCell className={Number(e.points) >= 0 ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                              {Number(e.points) >= 0 ? "+" : ""}{e.points}
                            </TableCell>
                            <TableCell>{e.branches?.name || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{e.reason || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Purchase history */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Purchase History</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Receipt</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {((custSales?.sales as any[]) || []).map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.sale_date}</TableCell>
                            <TableCell className="font-mono text-xs">{s.sale_number}</TableCell>
                            <TableCell>{s.branches?.name || "—"}</TableCell>
                            <TableCell>{fmt(s.total)}</TableCell>
                            <TableCell>{s.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
