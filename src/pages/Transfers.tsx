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
import { Truck } from "lucide-react";

type Destination = "shop" | "online_shop";

export default function Transfers() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(0);
  const [destination, setDestination] = useState<Destination>("shop");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const state = location.state as any;
    if (state?.openDialog) {
      setOpen(true);
      if (state.destination) setDestination(state.destination);
    }
  }, [location.state]);

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
        note: note ? `[→ ${destination === "online_shop" ? "Online Shop" : "Shop"}] ${note}` : `[→ ${destination === "online_shop" ? "Online Shop" : "Shop"}]`,
      });
      if (insertError) throw insertError;

      const stockField = destination === "online_shop" ? "online_shop_stock" : "shop_stock";
      const { error: updateError } = await supabase.from("products").update({
        production_stock: Number(selectedProduct.production_stock) - qty,
        [stockField]: Number(destination === "online_shop" ? (selectedProduct as any).online_shop_stock : selectedProduct.shop_stock) + qty,
      }).eq("id", productId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfer_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId(""); setQty(0); setNote("");
      toast({ title: "Transferred ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openWithDest = (dest: Destination) => {
    setDestination(dest);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Transfer Stock</h2>
        <div className="flex gap-2">
          <Button onClick={() => openWithDest("shop")}><Truck className="mr-2 h-4 w-4" />Transfer to Shop</Button>
          <Button variant="outline" onClick={() => openWithDest("online_shop")}><Truck className="mr-2 h-4 w-4" />Transfer to Online Shop</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
              ) : transfers?.map((t: any) => {
                const dest = t.note?.includes("Online Shop") ? "Online Shop" : "Shop";
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.transfer_date}</TableCell>
                    <TableCell className="font-medium">{t.products?.name} ({t.products?.bottle_size})</TableCell>
                    <TableCell>{t.quantity_transferred}</TableCell>
                    <TableCell><Badge variant="outline">{dest}</Badge></TableCell>
                    <TableCell>{t.note?.replace(/\[→ (?:Online Shop|Shop)\]\s?/, "") || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer to {destination === "online_shop" ? "Online Shop" : "Shop"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); transferMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size}) — {p.production_stock} in production</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedProduct && <p className="text-sm text-muted-foreground">Available in production: <strong>{selectedProduct.production_stock}</strong></p>}

            <div>
              <label className="text-sm text-muted-foreground">Destination</label>
              <Select value={destination} onValueChange={(v) => setDestination(v as Destination)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="online_shop">Online Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">How many?</label>
              <Input type="number" min={1} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} required />
            </div>
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
