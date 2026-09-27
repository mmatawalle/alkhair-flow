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
import { Plus, Ban, Receipt, Download, Trash2, X, UserPlus, QrCode, Search, Loader2, ShoppingBag } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { MobileList, MobileListItem } from "@/components/MobileList";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SaleReceipt } from "@/components/SaleReceipt";
import { downloadCSV } from "@/lib/csv-export";
import { fetchBranches, fetchStockMap, getBranchQty, type Branch } from "@/lib/inventory";
import { fetchAffordableRewards, fetchBalance, fetchActiveRule, resolveCustomer, searchCustomers, calculateMemberDiscount, type LoyaltyCustomer } from "@/lib/loyalty";
import { createSale, voidSale } from "@/lib/sales";
import { QrScanner } from "@/components/QrScanner";

interface SaleItem {
  key: number;
  product_id: string;
  quantity_sold: number;
  selling_price_per_unit: number;
  note: string;
}

const emptySaleItem = (key: number): SaleItem => ({
  key,
  product_id: "",
  quantity_sold: 0,
  selling_price_per_unit: 0,
  note: "",
});

export default function Sales() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [nextSaleKey, setNextSaleKey] = useState(2);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([emptySaleItem(1)]);
  const [branchId, setBranchId] = useState("");
  const [saleType, setSaleType] = useState("cash");
  const [posTerminalId, setPosTerminalId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  // Loyalty attach + POS redeem
  const [lookup, setLookup] = useState("");
  const [customer, setCustomer] = useState<LoyaltyCustomer | null>(null);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [affordable, setAffordable] = useState<any[]>([]);
  const [redeemId, setRedeemId] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [applyMemberDiscount, setApplyMemberDiscount] = useState(true);
  const [customerSearchResults, setCustomerSearchResults] = useState<LoyaltyCustomer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    const state = location.state as any;
    if (state?.openDialog) {
      resetForm();
      setOpen(true);
    }
    if (state?.loyaltyToken) {
      const token: string = String(state.loyaltyToken).trim();
      if (token) {
        resetForm();
        setOpen(true);
        setLookup(token);
        // defer attach so dialog/form state has reset; also clear history state to avoid repeat
        const t = setTimeout(async () => {
          try {
            let found: LoyaltyCustomer | null = null;
            try {
              found = await resolveCustomer({ token: token.toUpperCase() });
            } catch {}
            if (!found) {
              try {
                found = await resolveCustomer({ token });
              } catch {}
            }
            if (!found) {
              const results = await searchCustomers(token, 5);
              if (results[0]) found = results[0];
            }
            if (found) {
              await attachCustomerRecord(found);
            }
          } catch {}
        }, 150);
        // clear state so back/refresh doesn't re-trigger
        window.history.replaceState({}, document.title, location.pathname);
        return () => clearTimeout(t);
      }
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state]);

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => fetchBranches() });
  const retailBranches = (branches || []).filter((b) => b.type !== "production");

  useEffect(() => {
    if (!branchId && retailBranches.length) {
      const shop = retailBranches.find((b) => b.code === "SHOP") || retailBranches[0];
      setBranchId(shop.id);
    }
  }, [retailBranches, branchId]);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const productIds = (products || []).map((p: any) => p.id);
  const { data: stockMap } = useQuery({
    queryKey: ["stock_levels", productIds.join(",")],
    queryFn: () => fetchStockMap(productIds),
    enabled: productIds.length > 0,
  });

  const { data: loyaltyRule } = useQuery({
    queryKey: ["loyalty_rule_active"],
    queryFn: () => fetchActiveRule(),
  });
  const memberPct = Number((loyaltyRule as any)?.member_discount_percent ?? 5);

  const { data: posTerminals } = useQuery({
    queryKey: ["pos_terminals_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_terminals").select("id, label, terminal_id, bank_name, branch_id, is_active").eq("is_active", true).order("label");
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: bankAccounts } = useQuery({
    queryKey: ["bank_accounts_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("id, bank_name, account_name, account_number, branch_id, is_active").eq("is_active", true).order("bank_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, branches(name, code), loyalty_customers(full_name, phone), pos_terminals(label, terminal_id), bank_accounts(bank_name, account_name), sale_items(id, quantity, line_total, product_id, products(name, bottle_size))")
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: receiptData } = useQuery({
    queryKey: ["sale_receipt", receiptSaleId],
    queryFn: async () => {
      if (!receiptSaleId) return null;
      const { data: sale, error: sErr } = await supabase
        .from("sales")
        .select("*, branches(name), loyalty_customers(full_name, phone), pos_terminals(label, terminal_id), bank_accounts(bank_name, account_name)")
        .eq("id", receiptSaleId)
        .single();
      if (sErr) throw sErr;
      const { data: items, error: iErr } = await supabase
        .from("sale_items")
        .select("*, products(name, bottle_size)")
        .eq("sale_id", receiptSaleId);
      if (iErr) throw iErr;
      const { data: ledger } = await supabase
        .from("loyalty_points_ledger")
        .select("points")
        .eq("sale_id", receiptSaleId)
        .eq("entry_type", "earn");
      return { sale, items: items || [], pointsEarned: ((ledger as any[]) || []).reduce((s, e) => s + Number(e.points), 0) };
    },
    enabled: !!receiptSaleId,
  });

  const branchById = (id: string): Branch | undefined => (branches || []).find((b) => b.id === id);
  const selectedBranch = branchById(branchId);

  const resetForm = () => {
    setSaleType("cash");
    setPosTerminalId("");
    setBankAccountId("");
    setNote("");
    setSaleDate(new Date().toISOString().split("T")[0]);
    setSaleItems([emptySaleItem(1)]);
    setNextSaleKey(2);
    setLookup("");
    setCustomer(null);
    setCustomerBalance(0);
    setAffordable([]);
    setRedeemId("");
    setApplyMemberDiscount(true);
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
  };

  const attachCustomerRecord = async (found: LoyaltyCustomer) => {
    setCustomer(found);
    setShowCustomerDropdown(false);
    setCustomerSearchResults([]);
    setLookup(found.full_name);
    try {
      const bal = await fetchBalance(found.id);
      setCustomerBalance(bal);
      const { affordable: aff } = await fetchAffordableRewards(found.id);
      setAffordable(aff);
      setRedeemId("");
      toast({ title: `Attached: ${found.full_name}` });
    } catch (e: any) {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    }
  };

  const attachCustomer = async () => {
    const q = lookup.trim();
    if (!q) return;
    setLookupBusy(true);
    try {
      // Try token/phone exact first via resolveCustomer
      const isPhone = /^[+\d][\d\s-]*$/.test(q);
      let found: LoyaltyCustomer | null = null;
      try {
        found = await resolveCustomer(isPhone ? { phone: q } : { token: q });
      } catch {}
      // If not found via exact, try search by name/phone/email and pick best match
      if (!found) {
        const results = await searchCustomers(q, 5);
        if (results.length === 1) found = results[0];
        else if (results.length > 1) {
          // show dropdown for disambiguation instead of auto-picking
          setCustomerSearchResults(results);
          setShowCustomerDropdown(true);
          toast({ title: `${results.length} customers found`, description: "Select one from the list." });
          return;
        }
      }
      if (!found) {
        toast({ title: "Not found", description: "No active loyalty customer matches. Search by name, phone, email or scan QR.", variant: "destructive" });
        return;
      }
      await attachCustomerRecord(found);
    } catch (e: any) {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  const handleQrScanned = async (text: string) => {
    const token = text.trim();
    if (!token) return;
    setLookupBusy(true);
    try {
      const found = await resolveCustomer({ token });
      if (!found) {
        // fallback: maybe QR contains phone or raw search
        const results = await searchCustomers(token, 5);
        if (results[0]) {
          await attachCustomerRecord(results[0]);
          return;
        }
        toast({ title: "QR not recognized", description: "No customer for this QR token.", variant: "destructive" });
        return;
      }
      await attachCustomerRecord(found);
    } catch (e: any) {
      toast({ title: "QR lookup failed", description: e.message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  // Debounced search for autocomplete dropdown (name / phone / email)
  useEffect(() => {
    if (customer) {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    const q = lookup.trim();
    if (q.length < 2) {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const res = await searchCustomers(q, 8);
        if (!cancelled) {
          setCustomerSearchResults(res);
          setShowCustomerDropdown(res.length > 0);
        }
      } catch {
        if (!cancelled) {
          setCustomerSearchResults([]);
          setShowCustomerDropdown(false);
        }
      } finally {
        if (!cancelled) setSearchingCustomers(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [lookup, customer]);

  const addSaleRow = () => {
    setSaleItems((prev) => [...prev, emptySaleItem(nextSaleKey)]);
    setNextSaleKey((k) => k + 1);
  };

  const removeSaleRow = (key: number) => {
    setSaleItems((prev) => prev.filter((item) => item.key !== key));
  };

  const updateSaleRow = (key: number, field: keyof SaleItem, value: string | number) => {
    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, [field]: value };
        if (field === "product_id") {
          const product = products?.find((p: any) => p.id === value);
          next.selling_price_per_unit = Number((product as any)?.selling_price || 0);
        }
        return next;
      }),
    );
  };

  const getRowProduct = (id: string) => (products || []).find((p: any) => p.id === id) as any;
  const rowQty = (productId: string) => {
    if (!productId || !branchId) return 0;
    return getBranchQty(getRowProduct(productId), stockMap || new Map(), (branches || []) as Branch[], productId, branchId);
  };
  const validSaleItems = saleItems.filter((item) => item.product_id && item.quantity_sold > 0 && item.selling_price_per_unit >= 0);
  const batchTotal = validSaleItems.reduce((sum, item) => sum + item.quantity_sold * item.selling_price_per_unit, 0);
  const selectedReward = affordable.find((r) => r.id === redeemId);
  const memberDiscount = customer && applyMemberDiscount ? calculateMemberDiscount(batchTotal, memberPct) : 0;
  const rewardDiscountRaw = selectedReward ? Number(selectedReward.value_amount || 0) || (selectedReward.product_id ? Number((products || []).find((p: any) => p.id === selectedReward.product_id)?.selling_price || 0) : 0) : 0;
  const rewardDiscount = Math.min(rewardDiscountRaw, Math.max(0, batchTotal - memberDiscount));
  const payableTotal = Math.max(0, batchTotal - memberDiscount - (customer && redeemId ? rewardDiscount : 0));

  const saveMutation = useMutation({
    mutationFn: () =>
      createSale({
        branch_id: branchId,
        branch_code: selectedBranch?.code || "SHOP",
        customer_id: customer?.id || null,
        sale_type: saleType,
        pos_terminal_id: saleType === "pos" ? posTerminalId || null : null,
        bank_account_id: saleType === "transfer" ? bankAccountId || null : null,
        sale_date: saleDate,
        note: note || null,
        items: validSaleItems.map((i) => {
          const p = getRowProduct(i.product_id);
          return {
            product_id: i.product_id,
            category: p?.category || null,
            quantity: i.quantity_sold,
            unit_price: i.selling_price_per_unit,
            unit_cost: Number(p?.average_cost_per_unit || 0),
          };
        }),
        redeem_reward_id: customer && redeemId ? redeemId : null,
        apply_member_discount: customer ? applyMemberDiscount : false,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["loyalty_balances"] });
      setOpen(false);
      resetForm();
      toast({
        title: `${validSaleItems.length} item(s) sold ✓`,
        description: `${res.memberDiscount > 0 ? `-${fmt(res.memberDiscount)} member · ` : ""}${res.discount - res.memberDiscount > 0 ? `-${fmt(res.discount - res.memberDiscount)} redeemed · ` : ""}${res.pointsEarned > 0 ? `+${res.pointsEarned} pts earned` : ""}` || undefined,
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidSale(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setVoidId(null);
      toast({ title: "Sale voided ✓", description: "Stock restored, loyalty points reversed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  let filtered = sales as any[] | undefined;
  if (branchFilter !== "all") filtered = filtered?.filter((s) => s.branch_id === branchFilter);
  if (dateFrom) filtered = filtered?.filter((s) => s.sale_date >= dateFrom);
  if (dateTo) filtered = filtered?.filter((s) => s.sale_date <= dateTo);
  if (searchText) {
    const s = searchText.toLowerCase();
    filtered = filtered?.filter(
      (r: any) =>
        r.sale_number?.toLowerCase().includes(s) ||
        r.loyalty_customers?.full_name?.toLowerCase().includes(s) ||
        r.loyalty_customers?.phone?.includes(s) ||
        r.pos_terminals?.label?.toLowerCase().includes(s) ||
        r.bank_accounts?.bank_name?.toLowerCase().includes(s) ||
        r.bank_accounts?.account_name?.toLowerCase().includes(s) ||
        (r.sale_items || []).some((i: any) => i.products?.name?.toLowerCase().includes(s)),
    );
  }

  const { sort, toggleSort, sorted } = useSortableTable(filtered);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2 className="page-title">Sales</h2>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => {
              if (!filtered?.length) return;
              downloadCSV(
                "sales.csv",
                ["Date", "Receipt", "Branch", "Customer", "Items", "Total", "Type", "Channel", "Status"],
                filtered.map((s: any) => [
                  s.sale_date,
                  s.sale_number,
                  s.branches?.name || "—",
                  s.loyalty_customers ? `${s.loyalty_customers.full_name} (${s.loyalty_customers.phone})` : "Walk-in",
                  (s.sale_items || []).reduce((n: number, i: any) => n + Number(i.quantity), 0),
                  s.total,
                  s.sale_type,
                  s.sale_type === "pos" ? (s.pos_terminals?.label || "") : s.sale_type === "transfer" ? (s.bank_accounts ? `${s.bank_accounts.bank_name} ${s.bank_accounts.account_name}` : "") : "",
                  s.status,
                ]),
              );
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Sale
          </Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            placeholder="Receipt, customer, phone, product..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full sm:w-[220px]"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="text-xs text-muted-foreground">Branch</label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(branches || []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
          onClear={() => { setDateFrom(""); setDateTo(""); }}
        />
      </div>

      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          sorted.map((s: any) => {
            const items: any[] = s.sale_items || [];
            const qty = items.reduce((n, i) => n + Number(i.quantity), 0);
            const label = items.length === 1 ? `${items[0].products?.name} (${items[0].products?.bottle_size})` : `${items.length} items`;
            const caption = `${s.sale_date} · ${s.branches?.name || "—"} · ${qty} × ${fmt(s.total)}`;
            const act: any[] = [{ id: "receipt", label: "View receipt", icon: <Receipt className="h-4 w-4" />, onClick: () => setReceiptSaleId(s.id) }];
            if (s.status !== "voided") act.push({ id: "void", label: "Void sale", icon: <Ban className="h-4 w-4" />, onClick: () => setVoidId(s.id), variant: "destructive" as const });
            return (
              <MobileListItem
                key={s.id}
                avatarFallback={items[0]?.products?.name || "S"}
                supportingIcon={<ShoppingBag className="h-3 w-3" />}
                heading={label}
                caption={caption}
                meta={
                  <>
                    {s.sale_number} {s.sale_type === "pos" ? `· ${s.pos_terminals?.label || "POS"}` : s.sale_type === "transfer" ? `· ${s.bank_accounts?.bank_name || "Transfer"}` : ""} {s.loyalty_customers ? `· ${s.loyalty_customers.full_name}` : ""}
                  </>
                }
                trailing={<Badge variant="outline" className="text-xs">{s.status === "voided" ? "VOIDED" : s.sale_type}</Badge>}
                actions={act}
                className={s.status === "voided" ? "opacity-60" : ""}
              />
            );
          })
        )}
      </MobileList>

      {/* Desktop table */}
      <div className="desktop-table">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Date" sortKey="sale_date" sort={sort} onToggle={toggleSort} />
                    <TableHead>Receipt</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <SortableTableHead label="Total" sortKey="total" sort={sort} onToggle={toggleSort} />
                    <TableHead>Type</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((s: any) => {
                      const items: any[] = s.sale_items || [];
                      const channelDetail = s.sale_type === "pos" ? (s.pos_terminals?.label || "") : s.sale_type === "transfer" ? (s.bank_accounts ? `${s.bank_accounts.bank_name}` : "") : "";
                      return (
                        <TableRow key={s.id} className={s.status === "voided" ? "opacity-40 line-through" : ""}>
                          <TableCell className="whitespace-nowrap">{s.sale_date}</TableCell>
                          <TableCell className="font-mono text-xs">{s.sale_number}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{s.branches?.name || "—"}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {s.loyalty_customers ? (
                              <>
                                {s.loyalty_customers.full_name}{" "}
                                <span className="text-muted-foreground text-xs">({s.loyalty_customers.phone})</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Walk-in</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {items.length === 1
                              ? `${items[0].products?.name} × ${items[0].quantity}`
                              : `${items.length} items (${items.reduce((n: number, i: any) => n + Number(i.quantity), 0)} units)`}
                          </TableCell>
                          <TableCell>{fmt(s.total)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <Badge variant="outline">{s.status === "voided" ? "VOIDED" : s.sale_type}</Badge>
                              {channelDetail && <span className="text-[11px] text-muted-foreground mt-1">{channelDetail}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" title="Receipt" onClick={() => setReceiptSaleId(s.id)}>
                                <Receipt className="h-4 w-4" />
                              </Button>
                              {s.status !== "voided" && (
                                <Button variant="ghost" size="icon" title="Void" onClick={() => setVoidId(s.id)}>
                                  <Ban className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}
      >
        <DialogContent className="w-[96vw] max-w-[1120px] sm:max-w-[1120px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sale</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">Branch</label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {retailBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Payment type</label>
                  <Select value={saleType} onValueChange={(v) => { setSaleType(v); setPosTerminalId(""); setBankAccountId(""); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="transfer">Bank Transfer</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sale date</label>
                  <Input className="h-9" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                </div>
              </div>
              {saleType === "pos" && (
                <div>
                  <label className="text-xs text-muted-foreground">POS Terminal *</label>
                  <Select value={posTerminalId} onValueChange={setPosTerminalId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select POS terminal" />
                    </SelectTrigger>
                    <SelectContent>
                      {(posTerminals || []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No active terminals — add in POS & Banks</div>}
                      {(posTerminals || []).map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.label}{t.terminal_id ? ` — ${t.terminal_id}` : ""}{t.bank_name ? ` (${t.bank_name})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(posTerminals || []).length === 0 && <p className="text-[11px] text-amber-600 mt-1">No POS configured. Create one in POS & Banks → POS Terminals.</p>}
                </div>
              )}
              {saleType === "transfer" && (
                <div>
                  <label className="text-xs text-muted-foreground">Bank Account *</label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {(bankAccounts || []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No active bank accounts — add in POS & Banks</div>}
                      {(bankAccounts || []).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name} ({b.account_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(bankAccounts || []).length === 0 && <p className="text-[11px] text-amber-600 mt-1">No bank account configured. Create one in POS & Banks → Bank Accounts.</p>}
                </div>
              )}

              {/* Loyalty attach + POS redeem (customer approval) */}
              <div className="rounded-lg border border-dashed border-border bg-card p-2.5 space-y-2">
                {customer ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {customer.full_name} <span className="text-muted-foreground font-normal">· {customer.phone}</span>{customer.email ? <span className="text-muted-foreground font-normal"> · {customer.email}</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{customerBalance} pts available · {customer.tier}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => { setCustomer(null); setCustomerBalance(0); setAffordable([]); setRedeemId(""); setLookup(""); setCustomerSearchResults([]); setShowCustomerDropdown(false); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="rounded border bg-muted/30 p-2 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyMemberDiscount}
                          onChange={(e) => setApplyMemberDiscount(e.target.checked)}
                        />
                        Apply {memberPct}% member discount {memberDiscount > 0 && <span className="text-emerald-600">(-{fmt(memberDiscount)})</span>}
                      </label>
                      <div>
                      <label className="text-xs text-muted-foreground">Redeem reward at checkout (customer approval required)</label>
                      <div className="mt-1 flex gap-2">
                        <Select value={redeemId || "__none"} onValueChange={(v) => setRedeemId(v === "__none" ? "" : v)}>
                          <SelectTrigger className="h-8 flex-1"><SelectValue placeholder={affordable.length ? "No redeem" : "No affordable rewards"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">No redeem</SelectItem>
                            {affordable.map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name} — {r.points_cost} pts{Number(r.value_amount) ? ` (-${fmt(r.value_amount)})` : r.product_id ? " (free item)" : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {redeemId && <Badge variant="secondary" className="shrink-0">-{fmt(rewardDiscount)}</Badge>}
                      </div>
                      {redeemId && <p className="text-xs text-muted-foreground mt-1">Deduct {selectedReward?.points_cost} pts, apply {fmt(rewardDiscount)} discount. Ledger + redemption will be created with this sale.</p>}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="h-9 pl-8 pr-8"
                          placeholder="Search customer by name, phone or email…"
                          value={lookup}
                          onChange={(e) => setLookup(e.target.value)}
                          onFocus={() => { if (customerSearchResults.length) setShowCustomerDropdown(true); }}
                          onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 180)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attachCustomer(); } if (e.key === "Escape") setShowCustomerDropdown(false); }}
                        />
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {searchingCustomers && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          {!!lookup && !searchingCustomers && (
                            <button
                              type="button"
                              aria-label="Clear"
                              className="rounded p-0.5 hover:bg-muted"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setLookup(""); setCustomerSearchResults([]); setShowCustomerDropdown(false); }}
                            >
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                        {showCustomerDropdown && customerSearchResults.length > 0 && (
                          <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-lg">
                            {customerSearchResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => attachCustomerRecord(c)}
                              >
                                <span className="text-sm font-medium leading-none">{c.full_name}</span>
                                <span className="text-xs text-muted-foreground truncate w-full">
                                  {c.phone}{c.email ? ` · ${c.email}` : ""} · {c.tier}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        title="Scan QR code"
                        aria-label="Scan QR code"
                        onClick={() => setQrOpen(true)}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" className="h-9 shrink-0" disabled={lookupBusy || !lookup.trim()} onClick={attachCustomer}>
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        {lookupBusy ? "..." : "Attach"}
                      </Button>
                    </div>
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <QrCode className="h-3 w-3" /> Tap QR to scan customer's loyalty code — it auto-attaches for the sale.
                    </p>
                  </div>
                )}
              </div>

              <Input className="h-9" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="space-y-2">
              {saleItems.map((item, idx) => {
                const avail = rowQty(item.product_id);
                const rowRevenue = Number(item.quantity_sold) * Number(item.selling_price_per_unit);
                return (
                  <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border p-2">
                    <div className="space-y-2">
                      <div className="grid gap-2 md:grid-cols-[1.4fr_0.7fr_0.8fr]">
                        <Select value={item.product_id} onValueChange={(v) => updateSaleRow(item.key, "product_id", v)}>
                          <SelectTrigger className="h-9 text-xs md:text-sm">
                            <SelectValue placeholder={`Product ${idx + 1}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(products || []).map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} ({p.bottle_size})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          className="h-9 text-xs md:text-sm"
                          placeholder="Qty"
                          value={item.quantity_sold || ""}
                          onChange={(e) => updateSaleRow(item.key, "quantity_sold", Number(e.target.value))}
                        />
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          className="h-9 text-xs md:text-sm"
                          placeholder="Price (₦)"
                          value={item.selling_price_per_unit || ""}
                          onChange={(e) => updateSaleRow(item.key, "selling_price_per_unit", Number(e.target.value))}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                        <Input
                          className="h-9 text-xs md:text-sm"
                          placeholder="Row note (optional)"
                          value={item.note}
                          onChange={(e) => updateSaleRow(item.key, "note", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground md:text-right">
                          {item.product_id ? `Available @ ${selectedBranch?.name || "branch"}: ${avail} · Total: ${fmt(rowRevenue)}` : "Choose a product"}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
                      onClick={() => removeSaleRow(item.key)}
                      disabled={saleItems.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addSaleRow} className="w-fit">
                <Plus className="mr-1 h-3 w-3" /> Add Row
              </Button>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm space-y-1">
                <div><span className="text-muted-foreground">Subtotal: </span><strong>{fmt(batchTotal)}</strong></div>
                {memberDiscount > 0 && <div className="text-xs"><span className="text-muted-foreground">Member {memberPct}%: </span><span className="text-emerald-600 font-medium">-{fmt(memberDiscount)}</span></div>}
                {redeemId && <div className="text-xs"><span className="text-muted-foreground">Redeem {selectedReward?.name}: </span><span className="text-destructive font-medium">-{fmt(rewardDiscount)}</span><span className="text-muted-foreground"> ({selectedReward?.points_cost} pts)</span></div>}
                <div><span className="text-muted-foreground">Payable: </span><strong>{fmt(payableTotal)}</strong>{customer && <span className="text-muted-foreground text-xs"> · +pts earned on save{redeemId ? " (after redeem)" : ""}</span>}</div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || validSaleItems.length === 0 || !branchId || (saleType === "pos" && !posTerminalId) || (saleType === "transfer" && !bankAccountId)}>
                {saveMutation.isPending ? "Saving..." : `Save Sale (${validSaleItems.length})`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <QrScanner open={qrOpen} onOpenChange={setQrOpen} onScanned={handleQrScanned} />

      <AlertDialog open={!!voidId} onOpenChange={() => setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be restored to the branch and any loyalty points earned will be reversed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => voidId && voidMutation.mutate(voidId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Void Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaleReceipt open={!!receiptSaleId} onOpenChange={() => setReceiptSaleId(null)} data={receiptData || null} />
    </div>
  );
}
