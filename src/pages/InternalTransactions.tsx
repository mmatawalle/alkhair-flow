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
import { Plus, CheckCircle, XCircle } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function InternalTransactions() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [settleId, setSettleId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [form, setForm] = useState({
    transaction_type: "product" as "product" | "cash",
    product_id: "",
    quantity: 0,
    amount: 0,
    taken_by: "",
    given_by: "",
    source_location: "shop",
    transaction_date: new Date().toISOString().split("T")[0],
    note: "",
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
      const { data, error } = await supabase.from("internal_transactions").select("*, products(name, bottle_size)").order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === form.product_id);
  const availableStock = selectedProduct
    ? (form.source_location === "online_shop" ? Number(selectedProduct.online_shop_stock) : Number(selectedProduct.shop_stock))
    : 0;

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

      const { error: insertError } = await supabase.from("internal_transactions").insert({
        transaction_type: form.transaction_type,
        product_id: form.transaction_type === "product" ? form.product_id : null,
        quantity: form.transaction_type === "product" ? form.quantity : 0,
        amount: form.transaction_type === "cash" ? form.amount : 0,
        taken_by: form.taken_by,
        given_by: form.given_by || null,
        source_location: form.source_location,
        transaction_date: form.transaction_date,
        note: form.note || null,
        status: "pending",
      });
      if (insertError) throw insertError;

      // For product type, reduce stock immediately
      if (form.transaction_type === "product" && selectedProduct) {
        const updateData = form.source_location === "online_shop"
          ? { online_shop_stock: Number(selectedProduct.online_shop_stock) - form.quantity }
          : { shop_stock: Number(selectedProduct.shop_stock) - form.quantity };
        const { error: updateError } = await supabase.from("products").update(updateData).eq("id", form.product_id);
        if (updateError) throw updateError;
      }
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

  const settleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("internal_transactions").update({ status: "settled" }).eq("id", id);
      if (error) throw error;
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal_transactions"] });
      setDeleteId(null);
      toast({ title: "Deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  let filtered = filterStatus === "all" ? transactions : transactions?.filter(t => t.status === filterStatus);
  if (dateFrom) filtered = filtered?.filter(t => t.transaction_date >= dateFrom);
  if (dateTo) filtered = filtered?.filter(t => t.transaction_date <= dateTo);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Internal Transactions</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Transaction</Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {["all", "pending", "settled"].map(s => (
            <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)} className="capitalize">
              {s}
            </Button>
          ))}
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item / Amount</TableHead>
                <TableHead>Taken By</TableHead>
                <TableHead>Given By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
              ) : filtered?.map((t: any) => (
                <TableRow key={t.id} className={t.voided ? "opacity-50" : ""}>
                  <TableCell>{t.transaction_date}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{t.transaction_type}</Badge></TableCell>
                  <TableCell className="font-medium">
                    {t.transaction_type === "product"
                      ? `${t.products?.name} (${t.products?.bottle_size}) × ${t.quantity}`
                      : fmt(t.amount)}
                  </TableCell>
                  <TableCell>{t.taken_by || "—"}</TableCell>
                  <TableCell>{t.given_by || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={t.voided ? "secondary" : t.status === "pending" ? "destructive" : "default"}>
                      {t.voided ? "Voided" : t.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!t.voided && t.status === "pending" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Settle" onClick={() => setSettleId(t.id)}>
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
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Internal Transaction</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
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
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>
                    {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-sm text-muted-foreground">Take from</label>
                  <Select value={form.source_location} onValueChange={(v) => setForm({ ...form, source_location: v })}>
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
                  <Input type="number" min={1} value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} required />
                </div>
              </>
            )}

            {form.transaction_type === "cash" && (
              <div>
                <label className="text-sm text-muted-foreground">Amount (₦)</label>
                <Input type="number" step="any" min={0} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
              </div>
            )}

            <Input placeholder="Taken by (who?)" value={form.taken_by} onChange={(e) => setForm({ ...form, taken_by: e.target.value })} required />
            <Input placeholder="Given by (optional)" value={form.given_by} onChange={(e) => setForm({ ...form, given_by: e.target.value })} />
            <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} />
            <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settle Confirm */}
      <AlertDialog open={!!settleId} onOpenChange={() => setSettleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settle this transaction?</AlertDialogTitle>
            <AlertDialogDescription>This marks the transaction as settled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => settleId && settleMutation.mutate(settleId)}>Settle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
