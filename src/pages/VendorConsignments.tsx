import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Download } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { downloadCSV } from "@/lib/csv-export";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VendorConsignments() {
  const [tab, setTab] = useState("consignments");
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dmgOpen, setDmgOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [payAmount, setPayAmount] = useState(0);
  const [payVendor, setPayVendor] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNote, setPayNote] = useState("");
  const [dmgVendor, setDmgVendor] = useState("");
  const [dmgProduct, setDmgProduct] = useState("");
  const [dmgQty, setDmgQty] = useState(0);
  const [dmgReason, setDmgReason] = useState("damaged");
  const [dmgDate, setDmgDate] = useState(new Date().toISOString().split("T")[0]);
  const [dmgNote, setDmgNote] = useState("");
  const [deleteId, setDeleteId] = useState<{ id: string; type: string } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => { const { data } = await supabase.from("vendors").select("*").order("name"); return data || []; },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => { const { data } = await supabase.from("products").select("*").order("name"); return data || []; },
  });

  const vendorProducts = products?.filter(p => p.vendor_id) || [];

  const { data: consignments, isLoading: loadingC } = useQuery({
    queryKey: ["vendor_consignments"],
    queryFn: async () => {
      const { data } = await supabase.from("vendor_consignments").select("*, vendors(name), products(name, bottle_size)").order("consignment_date", { ascending: false });
      return data || [];
    },
  });

  const { data: payments, isLoading: loadingP } = useQuery({
    queryKey: ["vendor_payments"],
    queryFn: async () => {
      const { data } = await supabase.from("vendor_payments").select("*, vendors(name)").order("payment_date", { ascending: false });
      return data || [];
    },
  });

  const { data: damages, isLoading: loadingD } = useQuery({
    queryKey: ["vendor_damages"],
    queryFn: async () => {
      const { data } = await supabase.from("vendor_damages").select("*, vendors(name), products(name, bottle_size)").order("damage_date", { ascending: false });
      return data || [];
    },
  });

  // Filtering
  let filteredC = consignments || [];
  let filteredP = payments || [];
  let filteredD = damages || [];
  if (dateFrom) {
    filteredC = filteredC.filter(r => r.consignment_date >= dateFrom);
    filteredP = filteredP.filter(r => r.payment_date >= dateFrom);
    filteredD = filteredD.filter(r => r.damage_date >= dateFrom);
  }
  if (dateTo) {
    filteredC = filteredC.filter(r => r.consignment_date <= dateTo);
    filteredP = filteredP.filter(r => r.payment_date <= dateTo);
    filteredD = filteredD.filter(r => r.damage_date <= dateTo);
  }

  const sortC = useSortableTable(filteredC);
  const sortP = useSortableTable(filteredP);
  const sortD = useSortableTable(filteredD);

  // Add consignment
  const addConsignment = useMutation({
    mutationFn: async () => {
      if (!vendorId || !productId || quantity <= 0) throw new Error("Fill all fields");
      const { error } = await supabase.from("vendor_consignments").insert({
        vendor_id: vendorId, product_id: productId, quantity, consignment_date: date, note: note || null,
      });
      if (error) throw error;
      // Add to shop stock
      const product = products?.find(p => p.id === productId);
      if (product) {
        await supabase.from("products").update({ shop_stock: Number(product.shop_stock) + quantity }).eq("id", productId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_consignments"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setVendorId(""); setProductId(""); setQuantity(0); setNote("");
      setDate(new Date().toISOString().split("T")[0]);
      toast({ title: "Consignment recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Record payment
  const addPayment = useMutation({
    mutationFn: async () => {
      if (!payVendor || payAmount <= 0) throw new Error("Fill all fields");
      const { error } = await supabase.from("vendor_payments").insert({
        vendor_id: payVendor, amount: payAmount, payment_date: payDate, note: payNote || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_payments"] });
      qc.invalidateQueries({ queryKey: ["vendor_ledger"] });
      setPayOpen(false); setPayVendor(""); setPayAmount(0); setPayNote("");
      setPayDate(new Date().toISOString().split("T")[0]);
      toast({ title: "Payment recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Record damage
  const addDamage = useMutation({
    mutationFn: async () => {
      if (!dmgVendor || !dmgProduct || dmgQty <= 0) throw new Error("Fill all fields");
      const product = products?.find(p => p.id === dmgProduct);
      if (!product) throw new Error("Product not found");
      if (dmgQty > Number(product.shop_stock)) throw new Error(`Not enough stock. Available: ${product.shop_stock}`);

      const { error } = await supabase.from("vendor_damages").insert({
        vendor_id: dmgVendor, product_id: dmgProduct, quantity: dmgQty, reason: dmgReason,
        damage_date: dmgDate, note: dmgNote || null,
      });
      if (error) throw error;
      // Reduce stock
      await supabase.from("products").update({ shop_stock: Number(product.shop_stock) - dmgQty }).eq("id", dmgProduct);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_damages"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["vendor_ledger"] });
      setDmgOpen(false); setDmgVendor(""); setDmgProduct(""); setDmgQty(0); setDmgReason("damaged"); setDmgNote("");
      setDmgDate(new Date().toISOString().split("T")[0]);
      toast({ title: "Damage recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      if (type === "consignment") {
        const rec = consignments?.find(c => c.id === id);
        if (rec) {
          const product = products?.find(p => p.id === rec.product_id);
          if (product) {
            await supabase.from("products").update({ shop_stock: Math.max(0, Number(product.shop_stock) - Number(rec.quantity)) }).eq("id", rec.product_id);
          }
        }
        await supabase.from("vendor_consignments").delete().eq("id", id);
      } else if (type === "payment") {
        await supabase.from("vendor_payments").delete().eq("id", id);
      } else if (type === "damage") {
        const rec = damages?.find(d => d.id === id);
        if (rec) {
          const product = products?.find(p => p.id === rec.product_id);
          if (product) {
            await supabase.from("products").update({ shop_stock: Number(product.shop_stock) + Number(rec.quantity) }).eq("id", rec.product_id);
          }
        }
        await supabase.from("vendor_damages").delete().eq("id", id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_consignments"] });
      qc.invalidateQueries({ queryKey: ["vendor_payments"] });
      qc.invalidateQueries({ queryKey: ["vendor_damages"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["vendor_ledger"] });
      setDeleteId(null);
      toast({ title: "Deleted ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const dmgVendorProducts = vendorProducts.filter(p => p.vendor_id === dmgVendor);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-foreground">Vendor Operations</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setDmgOpen(true)}>Record Damage</Button>
          <Button variant="outline" onClick={() => setPayOpen(true)}>Record Payment</Button>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Consignment</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="consignments">Consignments</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="damages">Damages</TabsTrigger>
        </TabsList>

        <TabsContent value="consignments">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Date" sortKey="consignment_date" sort={sortC.sort} onToggle={sortC.toggleSort} />
                      <TableHead>Vendor</TableHead>
                      <TableHead>Product</TableHead>
                      <SortableTableHead label="Qty" sortKey="quantity" sort={sortC.sort} onToggle={sortC.toggleSort} />
                      <TableHead className="hidden md:table-cell">Note</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingC ? (
                      <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                    ) : sortC.sorted.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{c.consignment_date}</TableCell>
                        <TableCell className="font-medium">{c.vendors?.name}</TableCell>
                        <TableCell>{c.products?.name} <span className="text-xs text-muted-foreground">({c.products?.bottle_size})</span></TableCell>
                        <TableCell>{c.quantity}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{c.note || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId({ id: c.id, type: "consignment" })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Date" sortKey="payment_date" sort={sortP.sort} onToggle={sortP.toggleSort} />
                      <TableHead>Vendor</TableHead>
                      <SortableTableHead label="Amount" sortKey="amount" sort={sortP.sort} onToggle={sortP.toggleSort} />
                      <TableHead className="hidden md:table-cell">Note</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingP ? (
                      <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
                    ) : sortP.sorted.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{p.payment_date}</TableCell>
                        <TableCell className="font-medium">{p.vendors?.name}</TableCell>
                        <TableCell>{fmt(p.amount)}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{p.note || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId({ id: p.id, type: "payment" })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="damages">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Date" sortKey="damage_date" sort={sortD.sort} onToggle={sortD.toggleSort} />
                      <TableHead>Vendor</TableHead>
                      <TableHead>Product</TableHead>
                      <SortableTableHead label="Qty" sortKey="quantity" sort={sortD.sort} onToggle={sortD.toggleSort} />
                      <TableHead className="hidden md:table-cell">Reason</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingD ? (
                      <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                    ) : sortD.sorted.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{d.damage_date}</TableCell>
                        <TableCell className="font-medium">{d.vendors?.name}</TableCell>
                        <TableCell>{d.products?.name} <span className="text-xs text-muted-foreground">({d.products?.bottle_size})</span></TableCell>
                        <TableCell>{d.quantity}</TableCell>
                        <TableCell className="hidden md:table-cell capitalize">{d.reason}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId({ id: d.id, type: "damage" })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Consignment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Consignment</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addConsignment.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Vendor</label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Product</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>
                  {vendorProducts.filter(p => p.vendor_id === vendorId).map(p =>
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Quantity</label>
              <Input type="number" min={1} value={quantity || ""} onChange={e => setQuantity(Number(e.target.value))} required />
            </div>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={addConsignment.isPending}>{addConsignment.isPending ? "Saving..." : "Record"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Vendor Payment</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addPayment.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Vendor</label>
              <Select value={payVendor} onValueChange={setPayVendor}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Amount (₦)</label>
              <Input type="number" step="any" min={0} value={payAmount || ""} onChange={e => setPayAmount(Number(e.target.value))} required />
            </div>
            <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={payNote} onChange={e => setPayNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={addPayment.isPending}>{addPayment.isPending ? "Saving..." : "Record Payment"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Damage Dialog */}
      <Dialog open={dmgOpen} onOpenChange={setDmgOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Vendor Product Damage</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); addDamage.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Vendor</label>
              <Select value={dmgVendor} onValueChange={v => { setDmgVendor(v); setDmgProduct(""); }}>
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Product</label>
              <Select value={dmgProduct} onValueChange={setDmgProduct}>
                <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>
                  {dmgVendorProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Quantity</label>
              <Input type="number" min={1} value={dmgQty || ""} onChange={e => setDmgQty(Number(e.target.value))} required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Reason</label>
              <Select value={dmgReason} onValueChange={setDmgReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="returned">Returned to Vendor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={dmgDate} onChange={e => setDmgDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={dmgNote} onChange={e => setDmgNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={addDamage.isPending}>{addDamage.isPending ? "Saving..." : "Record Damage"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This will reverse the stock effect and remove the record.</AlertDialogDescription>
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
