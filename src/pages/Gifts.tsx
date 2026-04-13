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

const REASONS = ["family", "friend", "promo", "VIP", "house_use"];

export default function Gifts() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [sourceLocation, setSourceLocation] = useState("shop");
  const [qty, setQty] = useState(0);
  const [giftDate, setGiftDate] = useState(new Date().toISOString().split("T")[0]);
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("family");
  const [note, setNote] = useState("");
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

  const { data: gifts, isLoading } = useQuery({
    queryKey: ["gift_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gift_records").select("*, products(name, bottle_size)").order("gift_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedProduct = products?.find(p => p.id === productId);
  const availableStock = selectedProduct
    ? (sourceLocation === "production" ? Number(selectedProduct.production_stock) : Number(selectedProduct.shop_stock))
    : 0;

  const giftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (qty <= 0) throw new Error("Quantity must be > 0");
      if (qty > availableStock) {
        throw new Error(`Not enough stock. Available: ${availableStock}`);
      }

      const { error: insertError } = await supabase.from("gift_records").insert({
        product_id: productId,
        source_location: sourceLocation,
        quantity: qty,
        gift_date: giftDate,
        recipient: recipient || null,
        reason_category: reason,
        note: note || null,
      });
      if (insertError) throw insertError;

      // Use explicit update object to avoid TS computed property issue
      const updateData = sourceLocation === "production"
        ? { production_stock: Number(selectedProduct.production_stock) - qty }
        : { shop_stock: Number(selectedProduct.shop_stock) - qty };

      const { error: updateError } = await supabase.from("products").update(updateData).eq("id", productId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift_records"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setProductId(""); setQty(0); setRecipient(""); setNote("");
      toast({ title: "Gift recorded ✓" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Gifts / Free Items</h2>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Gift</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : gifts?.map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell>{g.gift_date}</TableCell>
                  <TableCell className="font-medium">{g.products?.name} ({g.products?.bottle_size})</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{g.source_location}</Badge></TableCell>
                  <TableCell>{g.quantity}</TableCell>
                  <TableCell>{g.recipient || "—"}</TableCell>
                  <TableCell className="capitalize">{g.reason_category?.replace(/_/g, " ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Gift / Free Item</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); giftMutation.mutate(); }} className="space-y-3">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
              <SelectContent>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.bottle_size})</SelectItem>)}
              </SelectContent>
            </Select>

            <div>
              <label className="text-sm text-muted-foreground">Take from</label>
              <Select value={sourceLocation} onValueChange={setSourceLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && <p className="text-sm text-muted-foreground">Available: <strong>{availableStock}</strong></p>}

            <Input type="number" min={1} placeholder="Quantity" value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} required />
            <Input type="date" value={giftDate} onChange={(e) => setGiftDate(e.target.value)} />
            <Input placeholder="Recipient (optional)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />

            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <DialogFooter>
              <Button type="submit" disabled={giftMutation.isPending}>{giftMutation.isPending ? "Saving..." : "Add Gift"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
