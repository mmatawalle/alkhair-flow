import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, XCircle, Download } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { downloadCSV } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SETTLEMENT_METHODS = ["cash", "transfer", "pos", "other"];

export default function InternalTransactions() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("pending");
  const [settleId, setSettleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [settlementMethod, setSettlementMethod] = useState("cash");
  const [amountSettled, setAmountSettled] = useState(0);
  const [dateSettled, setDateSettled] = useState(new Date().toISOString().split("T")[0]);
  const [receivedBy, setReceivedBy] = useState("");

  const [form, setForm] = useState({
    transaction_type: "product" as "product" | "cash",
    product_id: "", quantity: 0, amount: 0, taken_by: "", given_by: "",
    source_location: "shop", transaction_date: new Date().toISOString().split("T")[0], note: "",
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if ((location.state as any)?.openDialog) setOpen(true);
  }, [location.state]);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["internal_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("internal_transactions").select("*, products(name, bottle_size, selling_price)").order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === form.product_id);
  const availableStock = selectedProduct
    ? (form.source_location === "online_shop" ? Number(selectedProduct.online_shop_stock) : Number(selectedProduct.shop_stock))
    : 0;

  // Filtering
  const filtered = useMemo(() => {
    let result = transactions ?? [];
    if (tab !== "all") result = result.filter(t => t.status === tab);
    if (typeFilter !== "all") result = result.filter(t => t.transaction_type === typeFilter);
    if (personFilter) {
      const s = personFilter.toLowerCase();
      result = result.filter(t => t.taken_by?.toLowerCase().includes(s) || t.given_by?.toLowerCase().includes(s));
    }
    if (dateFrom) result = result.filter(t => t.transaction_date >= dateFrom);
    if (dateTo) result = result.filter(t => t.transaction_date <= dateTo);
    return result;
  }, [transactions, tab, typeFilter, personFilter, dateFrom, dateTo]);

  const { sort, toggleSort, sorted } = useSortableTable(filtered);

  // Get value for a transaction
  const getValue = (t: any) => {
    if (t.transaction_type === "cash") return Number(t.amount);
    return Number(t.quantity) * Number(t.products?.selling_price || 0);
  };

  const totalPendingValue = useMemo(() =>
    (transactions ?? []).filter(t => t.status === "pending").reduce((s, t) => s + getValue(t), 0),
    [transactions]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.transaction_type === "product") {
        if (!selectedProduct) throw new Error("Select a product");
        if (form.quantity <= 0) throw new Error("Quantity must be > 0");
        if (form.quantity > availableStock) throw new Error(`Not enough stock. Available: ${availableStock}`);
      } else {
        if (form.amount <= 0) throw new Error("Amount must be > 0");
      }
      if (!form.taken_by) throw new Error("Enter who took it");

      const { error } = await supabase.from("internal_transactions").insert({
        transaction_type: form.transaction_type,
        product_id: form.transaction_type === "product" ? form.product_id : null,
        quantity: form.transaction_type === "product" ? form.quantity : 0,
        amount: form.transaction_type === "cash" ? form.amount : 0,
        taken_by: form.taken_by, given_by: form.given_by || null,
        source_location: form.source_location,
        transaction_date: form.transaction_date, note: form.note || null, status: "pending",
      });
      if (error) throw error;

      if (form.transaction_type === "product" && selectedProduct) {
        const updateData = form.source_location === "online_shop"
          ? { online_shop_stock: Number(selectedProduct.online_shop_stock) - form.quantity }
          : { shop_stock: Number(selectedProduct.shop_stock) - form.quantity };
        await supabase.from("products").update(updateData).eq("id", form.product_id);
      }

      await logAudit({ action_type: "create", module: "internal", note: `${form.taken_by} took ${form.transaction_type === "cash" ? fmt(form.amount) : form.quantity + " units"}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal_transactions"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setForm({ transaction_type: "product", product_id: "", quantity: 0, amount: 0, taken_by: "", given_by: "", source_location: "shop", transaction_date: new Date().toISOString().split("T")[0], note: "" });
      toast({ title: "Transaction recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openSettleForm = (id: string) => {
    const t = transactions?.find(tr => tr.id === id);
    setSettleId(id);
    setSettlementMethod("cash");
    setAmountSettled(t ? getValue(t) : 0);
    setDateSettled(new Date().toISOString().split("T")[0]);
    setReceivedBy("");
  };

  const settleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("internal_transactions").update({
        status: "settled", settlement_method: settlementMethod,
        amount_settled: amountSettled, date_settled: dateSettled,
        received_by: receivedBy || null,
      }).eq("id", id);
      if (error) throw error;
      await logAudit({ action_type: "settle", module: "internal", record_id: id, note: `Settled via ${settlementMethod}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal_transactions"] });
      setSettleId(null);
      toast({ title: "Settled ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("internal_transactions").delete().eq("id", id);
      if (error) throw error;
      await logAudit({ action_type: "delete", module: "internal", record_id: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal_transactions"] });
      setDeleteId(null);
      toast({ title: "Deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pendingCount = transactions?.filter(t => t.status === "pending").length ?? 0;
  const settledCount = transactions?.filter(t => t.status === "settled").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Internal Transactions</h2>
          {totalPendingValue > 0 && <p className="text-sm text-amber-600 font-medium">Pending value: {fmt(totalPendingValue)}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (!sorted.length) return;
            downloadCSV("internal-transactions.csv",
              ["Date", "Type", "Item", "Qty/Amount", "Value", "Taken By", "Given By", "Status", "Settled Via"],
              sorted.map((t: any) => [t.transaction_date, t.transaction_type,
                t.transaction_type === "product" ? `${t.products?.name} (${t.products?.bottle_size})` : "Cash",
                t.transaction_type === "product" ? t.quantity : t.amount,
                getValue(t), t.taken_by, t.given_by || "", t.status, t.settlement_method || ""
              ])
            );
          }}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="settled">Settled ({settledCount})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Person</label>
          <Input placeholder="Filter by name..." value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="w-[160px] h-8 text-sm" />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Date" sortKey="transaction_date" sort={sort} onToggle={toggleSort} />
                  <TableHead>Type</TableHead>
                  <TableHead>Item / Amount</TableHead>
                  <TableHead>Value</TableHead>
                  <SortableTableHead label="Taken By" sortKey="taken_by" sort={sort} onToggle={toggleSort} />
                  <TableHead>Given By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Settled Via</TableHead>
                  <TableHead className="hidden md:table-cell">Settled Amt</TableHead>
                  <TableHead className="hidden lg:table-cell">Date Settled</TableHead>
                  <TableHead className="hidden lg:table-cell">Received By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={12} className="text-center">Loading...</TableCell></TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">No transactions</TableCell></TableRow>
                ) : sorted.map((t: any) => (
                  <TableRow key={t.id} className={t.voided ? "opacity-50" : ""}>
                    <TableCell className="whitespace-nowrap">{t.transaction_date}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{t.transaction_type}</Badge></TableCell>
                    <TableCell className="font-medium">
                      {t.transaction_type === "product"
                        ? <span>{t.products?.name} ({t.products?.bottle_size}) × {t.quantity}</span>
                        : fmt(t.amount)}
                    </TableCell>
                    <TableCell className="font-medium">{fmt(getValue(t))}</TableCell>
                    <TableCell>{t.taken_by || "—"}</TableCell>
                    <TableCell>{t.given_by || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.voided ? "secondary" : t.status === "pending" ? "destructive" : "default"}>
                        {t.voided ? "Voided" : t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize">{t.settlement_method || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{t.amount_settled ? fmt(t.amount_settled) : "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{t.date_settled || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{t.received_by || "—"}</TableCell>
                    <TableCell>
                      {!t.voided && t.status === "pending" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="Settle" onClick={() => openSettleForm(t.id)}>
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteId(t.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Internal Transaction</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Type</label>
              <Select value={form.transaction_type} onValueChange={(v: "product" | "cash") => setForm({ ...form, transaction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product (bashi/credit)</SelectItem>
                  <SelectItem value="cash">Cash (held/collected)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.transaction_type === "product" && (
              <>
                <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>
                    {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-sm text-muted-foreground">Take from</label>
                  <Select value={form.source_location} onValueChange={v => setForm({ ...form, source_location: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shop">Shop</SelectItem>
                      <SelectItem value="online_shop">Online Shop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedProduct && <p className="text-sm text-muted-foreground">Available: <strong>{availableStock}</strong></p>}
                <div>
                  <label className="text-sm text-muted-foreground">Quantity</label>
                  <Input type="number" min={1} value={form.quantity || ""} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required />
                </div>
              </>
            )}
            {form.transaction_type === "cash" && (
              <div>
                <label className="text-sm text-muted-foreground">Amount (₦)</label>
                <Input type="number" step="any" min={0} value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} required />
              </div>
            )}
            <Input placeholder="Taken by (who?)" value={form.taken_by} onChange={e => setForm({ ...form, taken_by: e.target.value })} required />
            <Input placeholder="Given by (optional)" value={form.given_by} onChange={e => setForm({ ...form, given_by: e.target.value })} />
            <Input type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })} />
            <Input placeholder="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settle Dialog */}
      <Dialog open={!!settleId} onOpenChange={() => setSettleId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Settle Transaction</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (settleId) settleMutation.mutate(settleId); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">How was it settled?</label>
              <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_METHODS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Amount Settled (₦)</label>
              <Input type="number" step="any" min={0} value={amountSettled || ""} onChange={e => setAmountSettled(Number(e.target.value))} required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Date Settled</label>
              <Input type="date" value={dateSettled} onChange={e => setDateSettled(e.target.value)} />
            </div>
            <Input placeholder="Received by (who collected?)" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={settleMutation.isPending}>{settleMutation.isPending ? "Saving..." : "Mark as Settled"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
