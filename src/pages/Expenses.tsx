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
import { Plus } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";

const CATEGORIES = ["general", "transport", "utility", "maintenance", "salary", "packaging", "fuel", "other"];
const PAYMENT_NATURES = ["normal", "family_debt", "recoverable", "non_recoverable"];

export default function Expenses() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    expense_side: "shop", category_code: "general", amount: 0,
    expense_date: new Date().toISOString().split("T")[0], description: "",
    requested_by: "", payment_nature: "normal", linked_item: "",
  });
  const [filterSide, setFilterSide] = useState("all");
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.amount <= 0) throw new Error("Amount must be > 0");
      const { error } = await supabase.from("expense_records").insert({
        ...form,
        requested_by: form.requested_by || null,
        linked_item: form.linked_item || null,
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense_records"] });
      setOpen(false);
      toast({ title: "Expense recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = filterSide === "all" ? expenses : expenses?.filter(e => e.expense_side === filterSide);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Expenses</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Expense</Button>
      </div>

      <div className="flex gap-2">
        {["all", "shop", "production"].map(s => (
          <Button key={s} variant={filterSide === s ? "default" : "outline"} size="sm" onClick={() => setFilterSide(s)} className="capitalize">
            {s}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : filtered?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.expense_date}</TableCell>
                  <TableCell><Badge variant={e.expense_side === "shop" ? "default" : "secondary"} className="capitalize">{e.expense_side}</Badge></TableCell>
                  <TableCell className="capitalize">{e.category_code}</TableCell>
                  <TableCell className="font-medium">{fmt(e.amount)}</TableCell>
                  <TableCell>{e.description || "—"}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{e.payment_nature?.replace(/_/g, " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
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
            <div>
              <label className="text-sm text-muted-foreground">Payment type</label>
              <Select value={form.payment_nature} onValueChange={(v) => setForm({ ...form, payment_nature: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_NATURES.map(p => <SelectItem key={p} value={p} className="capitalize">{p.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Add Expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
