import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";

export default function Vendors() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [commissionRate, setCommissionRate] = useState(10);
  const [searchText, setSearchText] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Vendor ledger data
  const { data: ledgerData } = useQuery({
    queryKey: ["vendor_ledger"],
    queryFn: async () => {
      const [salesRes, paymentsRes, damagesRes] = await Promise.all([
        supabase.from("sale_records").select("*, products(vendor_id, commission_rate)").eq("voided", false),
        supabase.from("vendor_payments").select("*"),
        supabase.from("vendor_damages").select("*, products(vendor_id, selling_price)"),
      ]);
      return {
        sales: salesRes.data || [],
        payments: paymentsRes.data || [],
        damages: damagesRes.data || [],
      };
    },
  });

  const getLedger = (vendorId: string) => {
    const vendorSales = (ledgerData?.sales || []).filter((s: any) => s.products?.vendor_id === vendorId);
    const totalSales = vendorSales.reduce((sum: number, s: any) => sum + Number(s.total_revenue), 0);
    const totalCommission = vendorSales.reduce((sum: number, s: any) => {
      const rate = Number(s.products?.commission_rate || 0);
      return sum + (Number(s.total_revenue) * rate / 100);
    }, 0);
    const vendorOwed = totalSales - totalCommission;

    const vendorDamages = (ledgerData?.damages || []).filter((d: any) => d.products?.vendor_id === vendorId);
    const damageDeduction = vendorDamages.reduce((sum: number, d: any) => {
      const price = Number(d.products?.selling_price || 0);
      const rate = Number(vendors?.find(v => v.id === vendorId)?.default_commission_rate || 0);
      return sum + (Number(d.quantity) * price * (1 - rate / 100));
    }, 0);

    const totalPaid = (ledgerData?.payments || [])
      .filter((p: any) => p.vendor_id === vendorId)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const balance = vendorOwed - damageDeduction - totalPaid;

    return { totalSales, totalCommission, vendorOwed, damageDeduction, totalPaid, balance };
  };

  const filtered = vendors?.filter(v =>
    !searchText || v.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const { sort, toggleSort, sorted } = useSortableTable(filtered, { key: "name", direction: "asc" });

  const resetForm = () => { setEditingId(null); setName(""); setCommissionRate(10); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (editingId) {
        const { error } = await supabase.from("vendors").update({ name, default_commission_rate: commissionRate }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vendors").insert({ name, default_commission_rate: commissionRate });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      setOpen(false); resetForm();
      toast({ title: "Vendor saved ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (v: any) => {
    setEditingId(v.id); setName(v.name); setCommissionRate(v.default_commission_rate); setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-foreground">Vendors</h2>
        <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add Vendor</Button>
      </div>

      <Input placeholder="Search vendors..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-[200px] h-8 text-sm" />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Name" sortKey="name" sort={sort} onToggle={toggleSort} />
                  <TableHead>Commission %</TableHead>
                  <TableHead>Total Sales</TableHead>
                  <TableHead>Your Commission</TableHead>
                  <TableHead className="hidden md:table-cell">Owed</TableHead>
                  <TableHead className="hidden md:table-cell">Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center">Loading...</TableCell></TableRow>
                ) : sorted.map((v: any) => {
                  const l = getLedger(v.id);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>{v.default_commission_rate}%</TableCell>
                      <TableCell>{fmt(l.totalSales)}</TableCell>
                      <TableCell className="text-emerald-600">{fmt(l.totalCommission)}</TableCell>
                      <TableCell className="hidden md:table-cell">{fmt(l.vendorOwed)}</TableCell>
                      <TableCell className="hidden md:table-cell">{fmt(l.totalPaid)}</TableCell>
                      <TableCell className={l.balance > 0 ? "text-destructive font-semibold" : "text-emerald-600"}>{fmt(l.balance)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Vendor Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Vendor name" required />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Default Commission Rate (%)</label>
              <Input type="number" step="any" min={0} max={100} value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
