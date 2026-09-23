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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, CreditCard, Landmark, Building2, TrendingUp, Ban, Eye } from "lucide-react";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { fetchBranches, type Branch } from "@/lib/inventory";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PosTerminal = {
  id: string;
  label: string;
  terminal_id: string | null;
  bank_name: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  branches?: { name: string } | null;
};

type BankAccount = {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  branches?: { name: string } | null;
};

const emptyPos = { label: "", terminal_id: "", bank_name: "", branch_id: "", is_active: true };
const emptyBank = { bank_name: "", account_name: "", account_number: "", branch_id: "", is_active: true };

export default function PaymentChannels() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // filters for aggregated sales
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [channelType, setChannelType] = useState<"all" | "pos" | "transfer">("all");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // pos dialog
  const [posOpen, setPosOpen] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [posForm, setPosForm] = useState(emptyPos);
  const [posDeleteId, setPosDeleteId] = useState<string | null>(null);

  // bank dialog
  const [bankOpen, setBankOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [bankDeleteId, setBankDeleteId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("overview");

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });

  const { data: posTerminals, isLoading: posLoading } = useQuery({
    queryKey: ["pos_terminals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_terminals").select("*, branches(name)").order("label");
      if (error) throw error;
      return data as PosTerminal[];
    },
  });

  const { data: bankAccounts, isLoading: bankLoading } = useQuery({
    queryKey: ["bank_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*, branches(name)").order("bank_name");
      if (error) throw error;
      return data as BankAccount[];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["sales_channels_agg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, sale_type, total, status, branch_id, pos_terminal_id, bank_account_id, branches(name), pos_terminals(label, terminal_id), bank_accounts(bank_name, account_name)")
        .order("sale_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as any[];
    },
  });

  // helpers
  const branchName = (id: string | null) => (branches || []).find((b) => b.id === id)?.name || "—";

  // stats aggregation (only completed sales)
  const completed = (sales || []).filter((s) => s.status !== "voided");
  let filteredForStats = completed;
  if (branchFilter !== "all") filteredForStats = filteredForStats.filter((s) => s.branch_id === branchFilter);
  if (dateFrom) filteredForStats = filteredForStats.filter((s) => s.sale_date >= dateFrom);
  if (dateTo) filteredForStats = filteredForStats.filter((s) => s.sale_date <= dateTo);

  const posSales = filteredForStats.filter((s) => s.sale_type === "pos");
  const transferSales = filteredForStats.filter((s) => s.sale_type === "transfer");
  const cashSales = filteredForStats.filter((s) => s.sale_type === "cash");

  const posTotal = posSales.reduce((sum, s) => sum + Number(s.total), 0);
  const transferTotal = transferSales.reduce((sum, s) => sum + Number(s.total), 0);
  const cashTotal = cashSales.reduce((sum, s) => sum + Number(s.total), 0);

  // per-terminal / per-bank aggregation
  const posAgg = new Map<string, { label: string; count: number; total: number; terminal?: string }>();
  for (const s of posSales) {
    const key = s.pos_terminal_id || "__unassigned";
    const existing = posAgg.get(key) || { label: s.pos_terminals?.label || (key === "__unassigned" ? "Unassigned POS" : "Unknown"), count: 0, total: 0, terminal: s.pos_terminals?.terminal_id || undefined };
    existing.count += 1;
    existing.total += Number(s.total);
    posAgg.set(key, existing);
  }
  const bankAgg = new Map<string, { label: string; count: number; total: number }>();
  for (const s of transferSales) {
    const key = s.bank_account_id || "__unassigned";
    const label = s.bank_accounts ? `${s.bank_accounts.bank_name} — ${s.bank_accounts.account_name}` : (key === "__unassigned" ? "Unassigned Bank" : "Unknown");
    const existing = bankAgg.get(key) || { label, count: 0, total: 0 };
    existing.count += 1;
    existing.total += Number(s.total);
    bankAgg.set(key, existing);
  }

  // filtered sales list by channel type + selected channel
  let channelSales = filteredForStats;
  if (channelType !== "all") channelSales = channelSales.filter((s) => s.sale_type === channelType);
  if (selectedChannelId) {
    if (channelType === "pos" || (!channelType || channelType === "all")) {
      // if selectedChannelId matches a POS terminal, filter accordingly; otherwise bank
      const isPos = (posTerminals || []).some((p) => p.id === selectedChannelId);
      const isBank = (bankAccounts || []).some((b) => b.id === selectedChannelId);
      if (isPos) channelSales = channelSales.filter((s) => s.pos_terminal_id === selectedChannelId);
      else if (isBank) channelSales = channelSales.filter((s) => s.bank_account_id === selectedChannelId);
      else if (selectedChannelId === "__unassigned") {
        channelSales = channelSales.filter((s) => !s.pos_terminal_id && !s.bank_account_id);
      }
    }
  }

  // mutations - POS
  const savePosMutation = useMutation({
    mutationFn: async () => {
      if (!posForm.label.trim()) throw new Error("Label is required");
      const payload: any = {
        label: posForm.label.trim(),
        terminal_id: posForm.terminal_id.trim() || null,
        bank_name: posForm.bank_name.trim() || null,
        branch_id: posForm.branch_id || null,
        is_active: posForm.is_active,
      };
      if (editingPosId) {
        const { error } = await supabase.from("pos_terminals").update(payload).eq("id", editingPosId);
        if (error) throw error;
        await logAudit({ action_type: "update", module: "pos_terminals", record_id: editingPosId, new_values: payload });
      } else {
        const { data, error } = await supabase.from("pos_terminals").insert(payload).select("id").single();
        if (error) throw error;
        await logAudit({ action_type: "create", module: "pos_terminals", record_id: (data as any).id, new_values: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_terminals"] });
      setPosOpen(false); setEditingPosId(null); setPosForm(emptyPos);
      toast({ title: editingPosId ? "POS updated ✓" : "POS created ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePosActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("pos_terminals").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_terminals"] });
      toast({ title: "POS status updated ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePosMutation = useMutation({
    mutationFn: async (id: string) => {
      // check sales reference
      const { count, error: cErr } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("pos_terminal_id", id);
      if (cErr) throw cErr;
      if ((count || 0) > 0) throw new Error(`Cannot delete: ${count} sale(s) reference this terminal. Deactivate instead.`);
      const { error } = await supabase.from("pos_terminals").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action_type: "delete", module: "pos_terminals", record_id: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_terminals"] });
      setPosDeleteId(null);
      toast({ title: "POS deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // mutations - Bank
  const saveBankMutation = useMutation({
    mutationFn: async () => {
      if (!bankForm.bank_name.trim()) throw new Error("Bank name is required");
      if (!bankForm.account_name.trim()) throw new Error("Account name is required");
      if (!bankForm.account_number.trim()) throw new Error("Account number is required");
      const payload: any = {
        bank_name: bankForm.bank_name.trim(),
        account_name: bankForm.account_name.trim(),
        account_number: bankForm.account_number.trim(),
        branch_id: bankForm.branch_id || null,
        is_active: bankForm.is_active,
      };
      if (editingBankId) {
        const { error } = await supabase.from("bank_accounts").update(payload).eq("id", editingBankId);
        if (error) throw error;
        await logAudit({ action_type: "update", module: "bank_accounts", record_id: editingBankId, new_values: payload });
      } else {
        const { data, error } = await supabase.from("bank_accounts").insert(payload).select("id").single();
        if (error) throw error;
        await logAudit({ action_type: "create", module: "bank_accounts", record_id: (data as any).id, new_values: payload });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      setBankOpen(false); setEditingBankId(null); setBankForm(emptyBank);
      toast({ title: editingBankId ? "Bank account updated ✓" : "Bank account created ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleBankActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("bank_accounts").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      toast({ title: "Bank status updated ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBankMutation = useMutation({
    mutationFn: async (id: string) => {
      const { count, error: cErr } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("bank_account_id", id);
      if (cErr) throw cErr;
      if ((count || 0) > 0) throw new Error(`Cannot delete: ${count} sale(s) reference this account. Deactivate instead.`);
      const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action_type: "delete", module: "bank_accounts", record_id: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
      setBankDeleteId(null);
      toast({ title: "Bank account deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditPos = (p: PosTerminal) => {
    setEditingPosId(p.id);
    setPosForm({ label: p.label, terminal_id: p.terminal_id || "", bank_name: p.bank_name || "", branch_id: p.branch_id || "", is_active: p.is_active });
    setPosOpen(true);
  };
  const openEditBank = (b: BankAccount) => {
    setEditingBankId(b.id);
    setBankForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch_id: b.branch_id || "", is_active: b.is_active });
    setBankOpen(true);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title flex items-center gap-2"><CreditCard className="h-5 w-5" /> POS & Bank Channels</h2>
          <p className="text-xs text-muted-foreground">Manage POS terminals and bank accounts used for sales. Card stats aggregate per channel.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview & Stats</TabsTrigger>
          <TabsTrigger value="pos">POS Terminals ({posTerminals?.length || 0})</TabsTrigger>
          <TabsTrigger value="banks">Bank Accounts ({bankAccounts?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Filters */}
          <div className="filter-bar">
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">Branch</label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branches || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground">Channel</label>
              <Select value={channelType} onValueChange={(v: any) => { setChannelType(v); setSelectedChannelId(null); }}>
                <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> POS Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(posTotal)}</p><p className="text-xs text-muted-foreground">{posSales.length} sales</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="h-3 w-3" /> Transfer Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(transferTotal)}</p><p className="text-xs text-muted-foreground">{transferSales.length} sales</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Cash Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(cashTotal)}</p><p className="text-xs text-muted-foreground">{cashSales.length} sales</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Processed</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(posTotal + transferTotal + cashTotal)}</p><p className="text-xs text-muted-foreground">{filteredForStats.length} completed sales</p></CardContent>
            </Card>
          </div>

          {/* Per-channel breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> POS Breakdown</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Terminal</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Array.from(posAgg.entries()).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No POS sales in range</TableCell></TableRow>
                      ) : Array.from(posAgg.entries()).map(([id, v]) => (
                        <TableRow key={id} className={selectedChannelId === id ? "bg-muted/50" : ""}>
                          <TableCell>
                            <div className="font-medium text-sm">{v.label}</div>
                            {v.terminal && <div className="text-xs text-muted-foreground">TID: {v.terminal}</div>}
                          </TableCell>
                          <TableCell className="text-right">{v.count}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(v.total)}</TableCell>
                          <TableCell><Button variant="ghost" size="sm" className="h-7" onClick={() => { setChannelType("pos"); setSelectedChannelId(id); }}><Eye className="h-3 w-3 mr-1" /> View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Landmark className="h-4 w-4" /> Bank Transfer Breakdown</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Bank Account</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Array.from(bankAgg.entries()).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No transfer sales in range</TableCell></TableRow>
                      ) : Array.from(bankAgg.entries()).map(([id, v]) => (
                        <TableRow key={id} className={selectedChannelId === id ? "bg-muted/50" : ""}>
                          <TableCell className="font-medium text-sm">{v.label}</TableCell>
                          <TableCell className="text-right">{v.count}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(v.total)}</TableCell>
                          <TableCell><Button variant="ghost" size="sm" className="h-7" onClick={() => { setChannelType("transfer"); setSelectedChannelId(id); }}><Eye className="h-3 w-3 mr-1" /> View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Channel sales list */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Sales by Channel {selectedChannelId ? <Badge variant="secondary" className="ml-2">Filtered</Badge> : null}</CardTitle>
                {selectedChannelId && <Button variant="outline" size="sm" onClick={() => setSelectedChannelId(null)}>Clear filter</Button>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelSales.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">No sales for this filter</TableCell></TableRow>
                    ) : channelSales.slice(0, 200).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap text-xs">{s.sale_date}</TableCell>
                        <TableCell className="font-mono text-xs">{s.sale_number}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize text-xs">{s.sale_type}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {s.sale_type === "pos" ? (s.pos_terminals?.label || <span className="text-muted-foreground">Unassigned</span>) : s.sale_type === "transfer" ? (s.bank_accounts ? `${s.bank_accounts.bank_name} — ${s.bank_accounts.account_name}` : <span className="text-muted-foreground">Unassigned</span>) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{s.branches?.name || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(s.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {channelSales.length > 200 && <p className="text-xs text-muted-foreground p-3 text-center">Showing 200 of {channelSales.length} — refine filters to narrow.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">POS Terminals</h3>
            <Button size="sm" onClick={() => { setEditingPosId(null); setPosForm(emptyPos); setPosOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Terminal</Button>
          </div>

          <MobileList>
            {posLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : (posTerminals || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No POS terminals yet.</p>
            ) : (posTerminals || []).map((p) => (
              <MobileListItem
                key={p.id}
                avatarFallback={p.label}
                supportingIcon={<CreditCard className="h-3 w-3" />}
                heading={p.label}
                caption={`${p.bank_name || "—"} · ${p.terminal_id || "—"} · ${p.branches?.name || branchName(p.branch_id)}`}
                trailing={<Badge variant={p.is_active ? "default" : "secondary"} className="text-xs">{p.is_active ? "Active" : "Inactive"}</Badge>}
                className={!p.is_active ? "opacity-60" : ""}
                actions={[
                  { id: "edit", label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEditPos(p) },
                  { id: "toggle", label: p.is_active ? "Deactivate" : "Activate", icon: <Ban className="h-4 w-4" />, onClick: () => togglePosActive.mutate({ id: p.id, is_active: p.is_active }) },
                  { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setPosDeleteId(p.id), variant: "destructive" },
                ]}
              />
            ))}
          </MobileList>

          <div className="desktop-table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>TID</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                      ) : (posTerminals || []).map((p) => (
                        <TableRow key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                          <TableCell className="font-medium">{p.label}</TableCell>
                          <TableCell className="font-mono text-xs">{p.terminal_id || "—"}</TableCell>
                          <TableCell>{p.bank_name || "—"}</TableCell>
                          <TableCell>{p.branches?.name || branchName(p.branch_id)}</TableCell>
                          <TableCell><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditPos(p)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title={p.is_active ? "Deactivate" : "Activate"} onClick={() => togglePosActive.mutate({ id: p.id, is_active: p.is_active })}><Ban className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setPosDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="banks" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Bank Accounts</h3>
            <Button size="sm" onClick={() => { setEditingBankId(null); setBankForm(emptyBank); setBankOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Account</Button>
          </div>

          <MobileList>
            {bankLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : (bankAccounts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No bank accounts yet.</p>
            ) : (bankAccounts || []).map((b) => (
              <MobileListItem
                key={b.id}
                avatarFallback={b.bank_name}
                supportingIcon={<Building2 className="h-3 w-3" />}
                heading={`${b.bank_name} — ${b.account_name}`}
                caption={`${b.account_number} · ${b.branches?.name || branchName(b.branch_id)}`}
                trailing={<Badge variant={b.is_active ? "default" : "secondary"} className="text-xs">{b.is_active ? "Active" : "Inactive"}</Badge>}
                className={!b.is_active ? "opacity-60" : ""}
                actions={[
                  { id: "edit", label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEditBank(b) },
                  { id: "toggle", label: b.is_active ? "Deactivate" : "Activate", icon: <Ban className="h-4 w-4" />, onClick: () => toggleBankActive.mutate({ id: b.id, is_active: b.is_active }) },
                  { id: "delete", label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => setBankDeleteId(b.id), variant: "destructive" },
                ]}
              />
            ))}
          </MobileList>

          <div className="desktop-table">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                      ) : (bankAccounts || []).map((b) => (
                        <TableRow key={b.id} className={!b.is_active ? "opacity-60" : ""}>
                          <TableCell className="font-medium">{b.bank_name}</TableCell>
                          <TableCell>{b.account_name}</TableCell>
                          <TableCell className="font-mono text-xs">{b.account_number}</TableCell>
                          <TableCell>{b.branches?.name || branchName(b.branch_id)}</TableCell>
                          <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditBank(b)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title={b.is_active ? "Deactivate" : "Activate"} onClick={() => toggleBankActive.mutate({ id: b.id, is_active: b.is_active })}><Ban className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setBankDeleteId(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* POS dialog */}
      <Dialog open={posOpen} onOpenChange={(v) => { setPosOpen(v); if (!v) { setEditingPosId(null); setPosForm(emptyPos); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPosId ? "Edit POS Terminal" : "Add POS Terminal"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); savePosMutation.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Label *</label>
              <Input placeholder="e.g. Shop POS 1 — GTB" value={posForm.label} onChange={(e) => setPosForm({ ...posForm, label: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Terminal ID (TID)</label>
                <Input placeholder="Optional" value={posForm.terminal_id} onChange={(e) => setPosForm({ ...posForm, terminal_id: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Bank</label>
                <Input placeholder="e.g. GTBank" value={posForm.bank_name} onChange={(e) => setPosForm({ ...posForm, bank_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Branch</label>
              <Select value={posForm.branch_id || "__none"} onValueChange={(v) => setPosForm({ ...posForm, branch_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All branches</SelectItem>
                  {(branches || []).map((b: Branch) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Active</span>
              <Switch checked={posForm.is_active} onCheckedChange={(v) => setPosForm({ ...posForm, is_active: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPosOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savePosMutation.isPending}>{savePosMutation.isPending ? "Saving..." : editingPosId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bank dialog */}
      <Dialog open={bankOpen} onOpenChange={(v) => { setBankOpen(v); if (!v) { setEditingBankId(null); setBankForm(emptyBank); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingBankId ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveBankMutation.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Bank name *</label>
              <Input placeholder="e.g. GTBank" value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Account name *</label>
              <Input placeholder="e.g. Al-Khair Drinks" value={bankForm.account_name} onChange={(e) => setBankForm({ ...bankForm, account_name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Account number *</label>
              <Input placeholder="0123456789" value={bankForm.account_number} onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Branch</label>
              <Select value={bankForm.branch_id || "__none"} onValueChange={(v) => setBankForm({ ...bankForm, branch_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All branches</SelectItem>
                  {(branches || []).map((b: Branch) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Active</span>
              <Switch checked={bankForm.is_active} onCheckedChange={(v) => setBankForm({ ...bankForm, is_active: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveBankMutation.isPending}>{saveBankMutation.isPending ? "Saving..." : editingBankId ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!posDeleteId} onOpenChange={() => setPosDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete POS terminal?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. If sales reference it, deletion will be blocked — deactivate instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => posDeleteId && deletePosMutation.mutate(posDeleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bankDeleteId} onOpenChange={() => setBankDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bank account?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. If sales reference it, deletion will be blocked — deactivate instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => bankDeleteId && deleteBankMutation.mutate(bankDeleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
