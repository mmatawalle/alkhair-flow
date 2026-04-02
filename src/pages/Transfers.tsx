import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

export default function Transfers() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["transfer_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_records").select("*, products(name, bottle_size)").order("transfer_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === productId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (qty > Number(selectedProduct.production_stock)) {
        throw new Error(`Not enough production stock. Available: ${selectedProduct.production_stock}`);
      }

      const { error: insertError } = await supabase.from("transfer_records").insert({
        product_id: productId,
        quantity_transferred: qty,
        transfer_date: date,
        note: note || null,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase.from("products").update({
        production_stock: Number(selectedProduct.production_stock) - qty,
        shop_stock: Number(selectedProduct.shop_stock) + qty,
      }).eq("id", productId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfer_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId(""); setQty(0); setNote("");
      toast({ title: "Transfer recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Transfers (Production → Shop)</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Transfer</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center">Loading...</TableCell></TableRow>
              ) : transfers?.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{t.transfer_date}</TableCell>
                  <TableCell className="font-medium">{t.products?.name} ({t.products?.bottle_size})</TableCell>
                  <TableCell>{t.quantity_transferred}</TableCell>
                  <TableCell>{t.note || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer to Shop</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); transferMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size}) — Prod: {p.production_stock}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedProduct && <p className="text-sm text-muted-foreground">Available in production: {selectedProduct.production_stock}</p>}
            <Input type="number" min={1} placeholder="Quantity" value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} required />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={transferMutation.isPending}>{transferMutation.isPending ? "Saving..." : "Transfer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
