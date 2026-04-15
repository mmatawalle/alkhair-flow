import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Download, Eye } from "lucide-react";
import { ExpenseReceipt } from "@/components/ExpenseReceipt";
import { downloadCSV } from "@/lib/csv-export";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { logAudit } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = ["general", "transport", "utility", "maintenance", "salary", "packaging", "fuel", "other"];
const PAYMENT_NATURES = ["normal", "family_debt", "recoverable", "non_recoverable"];
const PAYMENT_SOURCES = ["cash", "bank", "pos", "other"];

const emptyForm = {
  expense_side: "shop", category_code: "general", amount: 0,
  expense_date: new Date().toISOString().split("T")[0], description: "",
  requested_by: "", payment_nature: "normal", payment_source: "cash", linked_item: "",
};

export default function Expenses() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterSide, setFilterSide] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptExpense, setReceiptExpense] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if ((location.state as any)?.openDialog) setOpen(true);
  }, [location.state]);

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expense_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_records").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => { setEditingId(null); setForm(emptyForm); };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      expense_side: e.expense_side, category_code: e.category_code, amount: e.amount,
      expense_date: e.expense_date, description: e.description || "",
      requested_by: e.requested_by || "", payment_nature: e.payment_nature,
      payment_source: (e as any).payment_source || "cash", linked_item: e.linked_item || "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.amount <= 0) throw new Error("Amount must be > 0");
      const payload = {
        ...form,
        requested_by: form.requested_by || null,
        linked_item: form.linked_item || null,
        description: form.description || null,
      };
      if (editingId) {
        const { error } = await supabase.from("expense_records").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expense_records").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_records"] });
      setOpen(false); resetForm();
      toast({ title: editingId ? "Expense updated ✓" : "Expense recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_records"] });
      setDeleteId(null);
      toast({ title: "Expense deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  let filtered = filterSide === "all" ? expenses : expenses?.filter(e => e.expense_side === filterSide);
  if (dateFrom) filtered = filtered?.filter(e => e.expense_date >= dateFrom);
  if (dateTo) filtered = filtered?.filter(e => e.expense_date <= dateTo);

  const { sort, toggleSort, sorted } = useSortableTable(filtered);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">Expenses</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => {
            if (!filtered?.length) return;
            downloadCSV("expenses.csv",
              ["Date", "Side", "Category", "Amount", "Description", "Payment"],
              filtered.map(e => [e.expense_date, e.expense_side, e.category_code, e.amount, e.description || "", e.payment_nature])
            );
          }}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Expense</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="flex gap-2 flex-wrap">
          {["all", "shop", "production"].map(s => (
            <Button key={s} variant={filterSide === s ? "default" : "outline"} size="sm" onClick={() => setFilterSide(s)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      {/* Mobile card list */}
      <div className="mobile-card-list">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : sorted.map((e: any) => (
          <div key={e.id} className="mobile-card-item">
            <div className="mobile-card-header">
              <div>
                <p className="mobile-card-title capitalize">{e.category_code}</p>
                <p className="text-xs text-muted-foreground">{e.expense_date}</p>
              </div>
              <Badge variant={e.expense_side === "shop" ? "default" : "secondary"} className="capitalize text-xs">{e.expense_side}</Badge>
            </div>
            <div className="mobile-card-row">
              <span className="text-muted-foreground text-sm">{e.description || "—"}</span>
              <span className="font-semibold text-sm">{fmt(e.amount)}</span>
            </div>
            <div className="mobile-card-actions">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setReceiptExpense(e)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> View
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(e)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setDeleteId(e.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="desktop-table">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Date" sortKey="expense_date" sort={sort} onToggle={toggleSort} />
                    <TableHead>Side</TableHead>
                    <TableHead>Category</TableHead>
                    <SortableTableHead label="Amount" sortKey="amount" sort={sort} onToggle={toggleSort} />
                    <TableHead>Description</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
                  ) : sorted.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{e.expense_date}</TableCell>
                      <TableCell><Badge variant={e.expense_side === "shop" ? "default" : "secondary"} className="capitalize text-xs">{e.expense_side}</Badge></TableCell>
                      <TableCell className="capitalize">{e.category_code}</TableCell>
                      <TableCell className="font-medium">{fmt(e.amount)}</TableCell>
                      <TableCell>{e.description || "—"}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{e.payment_nature?.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" title="View Receipt" onClick={() => setReceiptExpense(e)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Side</label>
                <Select value={form.expense_side} onValueChange={(v) => setForm({ ...form, expense_side: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shop">Shop</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Category</label>
                <Select value={form.category_code} onValueChange={(v) => setForm({ ...form, category_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Amount (₦)</label>
              <Input type="number" step="any" min={0} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
            </div>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            <Input placeholder="What was it for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input placeholder="Who asked? (optional)" value={form.requested_by} onChange={(e) => setForm({ ...form, requested_by: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Payment type</label>
                <Select value={form.payment_nature} onValueChange={(v) => setForm({ ...form, payment_nature: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_NATURES.map(p => <SelectItem key={p} value={p} className="capitalize">{p.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Payment source</label>
                <Select value={form.payment_source} onValueChange={(v) => setForm({ ...form, payment_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_SOURCES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Add Expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExpenseReceipt open={!!receiptExpense} onOpenChange={() => setReceiptExpense(null)} expense={receiptExpense} />
    </div>
  );
}
