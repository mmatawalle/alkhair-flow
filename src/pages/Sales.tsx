// @ts-nocheck -- references tables not yet in generated DB types
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
import { Plus, Minus, Ban, Receipt, Download, Trash2, X, UserPlus, QrCode, Search, Loader2, ShoppingBag, Banknote, Smartphone, CreditCard, Check, Sparkles } from "lucide-react";
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
import { getProductImage, DRINK_CATEGORIES, SNACK_CATEGORIES } from "@/lib/alkhair-menu";

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
  const [posCatFilter, setPosCatFilter] = useState("all");
  const [posSearch, setPosSearch] = useState("");
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
    setPosCatFilter("all");
    setPosSearch("");
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

  const POS_QUICK_TABS = [
    { id: "all", label: "All Items", icon: "✨" },
    { id: "drinks", label: "Drinks", icon: "🥤" },
    { id: "snacks", label: "Snacks", icon: "🥧" },
    { id: "Signature Milkshake Series", label: "Milkshakes", icon: "🍫" },
    { id: "Milk Series", label: "Milk Series", icon: "🥛" },
    { id: "Yoghurt Series", label: "Yoghurt", icon: "🥣" },
    { id: "Fresh & Natural Series", label: "Fresh Juices", icon: "🍊" },
    { id: "Native Series", label: "Native Drinks", icon: "🌺" },
    { id: "Slush Series", label: "Slush", icon: "🍧" },
    { id: "Classic Snacks", label: "Classic Snacks", icon: "🥐" },
    { id: "Native Snacks", label: "Native Snacks", icon: "🥟" },
    { id: "Ice Cream", label: "Ice Cream", icon: "🍦" },
  ];

  const handleProductTap = (product: any) => {
    setSaleItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.product_id === product.id);
      if (existingIndex !== -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity_sold: Number(item.quantity_sold || 0) + 1 }
            : item
        );
      }
      if (prev.length === 1 && !prev[0].product_id) {
        return [{
          ...prev[0],
          product_id: product.id,
          quantity_sold: 1,
          selling_price_per_unit: Number(product.selling_price || 0),
        }];
      }
      return [
        ...prev,
        {
          key: nextSaleKey,
          product_id: product.id,
          quantity_sold: 1,
          selling_price_per_unit: Number(product.selling_price || 0),
          note: "",
        },
      ];
    });
    setNextSaleKey((k) => k + 1);
  };

  const changeItemQty = (key: number, delta: number) => {
    setSaleItems((prev) => {
      const updated = prev.map((item) => {
        if (item.key !== key) return item;
        const nextQty = Number(item.quantity_sold || 0) + delta;
        return { ...item, quantity_sold: Math.max(0, nextQty) };
      });
      const filtered = updated.filter((item) => item.quantity_sold > 0);
      return filtered.length > 0 ? filtered : [emptySaleItem(1)];
    });
  };

  const catalogProducts = (products || []).filter((p: any) => {
    if (posSearch.trim()) {
      const q = posSearch.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchCat = p.category?.toLowerCase().includes(q);
      if (!matchName && !matchCat) return false;
    }
    if (posCatFilter === "all") return true;
    if (posCatFilter === "drinks") return DRINK_CATEGORIES.includes(p.category);
    if (posCatFilter === "snacks") return SNACK_CATEGORIES.includes(p.category);
    return p.category === posCatFilter;
  });

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
        <DialogContent className="w-[98vw] max-w-[1320px] max-h-[94vh] overflow-hidden flex flex-col p-3 sm:p-5">
          <DialogHeader className="pb-2 border-b shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <span>🥤</span>
                  <span>Al-Khair POS Register</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tap drinks or snacks to add · 1-touch payment · Real-time branch stock
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Branch:</label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-8 w-[130px] sm:w-[150px] text-xs">
                      <SelectValue placeholder="Branch" />
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
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date:</label>
                  <Input className="h-8 w-[125px] text-xs" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* 2-Column Responsive Body */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden pt-2 min-h-0">
            {/* Left 7 Columns: Visual Product Catalog */}
            <div className="lg:col-span-7 flex flex-col min-h-0 overflow-hidden pr-0 lg:pr-1">
              {/* Search & Category Pills */}
              <div className="space-y-2 mb-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search drinks, snacks, milkshakes..."
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    className="pl-8 h-8 text-xs sm:text-sm"
                  />
                  {posSearch && (
                    <button
                      type="button"
                      onClick={() => setPosSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Horizontal scroll category pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {POS_QUICK_TABS.map((tab) => {
                    const active = posCatFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPosCatFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 shrink-0 ${
                          active
                            ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                            : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Product Cards Grid */}
              <div className="flex-1 overflow-y-auto pr-1">
                {catalogProducts.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-xl bg-muted/20">
                    <ShoppingBag className="h-9 w-9 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">No products match this filter</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                      Check your search query or sync items from the Products page
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {catalogProducts.map((p: any) => {
                      const avail = rowQty(p.id);
                      const inCartItem = saleItems.find((i) => i.product_id === p.id);
                      const inCartQty = inCartItem?.quantity_sold || 0;
                      const photo = getProductImage(p.name, p.image_url);

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProductTap(p)}
                          className={`group relative text-left rounded-xl border p-2 flex flex-col justify-between transition-all hover:shadow-md hover:border-primary/60 bg-card active:scale-[0.98] ${
                            inCartQty > 0 ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border"
                          }`}
                        >
                          {inCartQty > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 z-10 bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center shadow">
                              +{inCartQty}
                            </span>
                          )}

                          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted mb-2 relative">
                            <img
                              src={photo}
                              alt={p.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                            <span className="absolute bottom-1 left-1 text-[9px] font-medium bg-black/70 text-white backdrop-blur-xs px-1.5 py-0.5 rounded">
                              {p.bottle_size || "Standard"}
                            </span>
                          </div>

                          <div className="min-w-0 w-full space-y-1">
                            <p className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-primary">
                              {p.name}
                            </p>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {fmt(p.selling_price || 0)}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                                avail > 0
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {avail > 0 ? `${avail} left` : "0 stock"}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 Columns: Cart & Checkout */}
            <div className="lg:col-span-5 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l lg:pl-4 pt-3 lg:pt-0">
              <form
                onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
                className="flex flex-col h-full min-h-0 space-y-2.5"
              >
                {/* Cart Header */}
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="font-semibold text-xs sm:text-sm flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    <span>Current Order</span>
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                      {validSaleItems.reduce((acc, i) => acc + Number(i.quantity_sold || 0), 0)} items
                    </Badge>
                  </h3>
                  {validSaleItems.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-muted-foreground hover:text-destructive px-2"
                      onClick={() => setSaleItems([emptySaleItem(1)])}
                    >
                      Clear order
                    </Button>
                  )}
                </div>

                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[120px] max-h-[220px] lg:max-h-none border rounded-xl p-2 bg-muted/20">
                  {validSaleItems.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <ShoppingBag className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
                      <p className="text-xs font-medium">Cart is empty</p>
                      <p className="text-[11px] opacity-75 mt-0.5">Tap any drink or snack to start order</p>
                    </div>
                  ) : (
                    saleItems
                      .filter((item) => item.product_id)
                      .map((item) => {
                        const p = getRowProduct(item.product_id);
                        const photo = getProductImage(p?.name || "", p?.image_url);
                        const lineTotal = Number(item.quantity_sold || 0) * Number(item.selling_price_per_unit || 0);

                        return (
                          <div
                            key={item.key}
                            className="flex items-center gap-2 p-1.5 rounded-lg bg-card border border-border shadow-2xs"
                          >
                            <img
                              src={photo}
                              alt={p?.name || "Drink"}
                              className="w-10 h-10 rounded-md object-cover bg-muted shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate">{p?.name || "Product"}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {fmt(item.selling_price_per_unit)} each
                              </p>
                            </div>

                            {/* Touch Stepper [-] qty [+] */}
                            <div className="flex items-center gap-0.5 shrink-0 bg-muted/70 p-0.5 rounded-lg border">
                              <button
                                type="button"
                                onClick={() => changeItemQty(item.key, -1)}
                                className="h-6 w-6 rounded flex items-center justify-center hover:bg-background active:scale-95 text-foreground"
                                title="Decrease"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center font-bold text-xs">
                                {item.quantity_sold}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeItemQty(item.key, +1)}
                                className="h-6 w-6 rounded flex items-center justify-center hover:bg-background active:scale-95 text-foreground"
                                title="Increase"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <div className="text-right shrink-0 min-w-[55px]">
                              <p className="text-xs font-bold text-foreground">{fmt(lineTotal)}</p>
                              <button
                                type="button"
                                onClick={() => removeSaleRow(item.key)}
                                className="text-[10px] text-destructive hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Loyalty attach + POS redeem */}
                <div className="rounded-lg border border-dashed border-border bg-card p-2 shrink-0 space-y-1.5">
                  {customer ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {customer.full_name} <span className="text-muted-foreground font-normal">· {customer.phone}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{customerBalance} pts available · {customer.tier}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => { setCustomer(null); setCustomerBalance(0); setAffordable([]); setRedeemId(""); setLookup(""); setCustomerSearchResults([]); setShowCustomerDropdown(false); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="rounded border bg-muted/30 p-1.5 space-y-1 text-xs">
                        <label className="flex items-center gap-1.5 font-medium cursor-pointer text-[11px]">
                          <input
                            type="checkbox"
                            checked={applyMemberDiscount}
                            onChange={(e) => setApplyMemberDiscount(e.target.checked)}
                          />
                          Apply {memberPct}% member discount {memberDiscount > 0 && <span className="text-emerald-600">(-{fmt(memberDiscount)})</span>}
                        </label>
                        {affordable.length > 0 && (
                          <div className="mt-1 flex gap-1.5">
                            <Select value={redeemId || "__none"} onValueChange={(v) => setRedeemId(v === "__none" ? "" : v)}>
                              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Redeem reward" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">No redeem</SelectItem>
                                {affordable.map((r: any) => (
                                  <SelectItem key={r.id} value={r.id}>{r.name} — {r.points_cost} pts{Number(r.value_amount) ? ` (-${fmt(r.value_amount)})` : r.product_id ? " (free item)" : ""}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {redeemId && <Badge variant="secondary" className="shrink-0 text-[10px]">-{fmt(rewardDiscount)}</Badge>}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            className="h-7 pl-6 pr-6 text-xs"
                            placeholder="Loyalty customer (phone / name)…"
                            value={lookup}
                            onChange={(e) => setLookup(e.target.value)}
                            onFocus={() => { if (customerSearchResults.length) setShowCustomerDropdown(true); }}
                            onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 180)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attachCustomer(); } if (e.key === "Escape") setShowCustomerDropdown(false); }}
                          />
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                            {searchingCustomers && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            {!!lookup && !searchingCustomers && (
                              <button
                                type="button"
                                aria-label="Clear"
                                className="rounded p-0.5 hover:bg-muted"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setLookup(""); setCustomerSearchResults([]); setShowCustomerDropdown(false); }}
                              >
                                <X className="h-3 w-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                          {showCustomerDropdown && customerSearchResults.length > 0 && (
                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-md border bg-popover shadow-lg">
                              {customerSearchResults.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left hover:bg-accent"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => attachCustomerRecord(c)}
                                >
                                  <span className="text-xs font-medium leading-none">{c.full_name}</span>
                                  <span className="text-[10px] text-muted-foreground truncate w-full">
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
                          className="h-7 w-7 shrink-0"
                          title="Scan QR code"
                          onClick={() => setQrOpen(true)}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="sm" className="h-7 px-2 text-xs shrink-0" disabled={lookupBusy || !lookup.trim()} onClick={attachCustomer}>
                          <UserPlus className="mr-1 h-3 w-3" />
                          Attach
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3 Large Touch Payment Buttons */}
                <div className="shrink-0 space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Payment Method *</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setSaleType("cash"); setPosTerminalId(""); setBankAccountId(""); }}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border-2 transition-all font-medium text-xs gap-0.5 ${
                        saleType === "cash"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-border hover:border-emerald-300 bg-card text-foreground"
                      }`}
                    >
                      <Banknote className="h-4 w-4 text-emerald-600" />
                      <span>💵 Cash</span>
                      {saleType === "cash" && <Badge className="bg-emerald-600 text-white text-[9px] py-0 px-1">Selected</Badge>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSaleType("transfer"); setPosTerminalId(""); }}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border-2 transition-all font-medium text-xs gap-0.5 ${
                        saleType === "transfer"
                          ? "border-blue-600 bg-blue-50 text-blue-900 shadow-xs dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-border hover:border-blue-300 bg-card text-foreground"
                      }`}
                    >
                      <Smartphone className="h-4 w-4 text-blue-600" />
                      <span>📱 Transfer</span>
                      {saleType === "transfer" && <Badge className="bg-blue-600 text-white text-[9px] py-0 px-1">Selected</Badge>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSaleType("pos"); setBankAccountId(""); }}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border-2 transition-all font-medium text-xs gap-0.5 ${
                        saleType === "pos"
                          ? "border-purple-600 bg-purple-50 text-purple-900 shadow-xs dark:bg-purple-950/40 dark:text-purple-300"
                          : "border-border hover:border-purple-300 bg-card text-foreground"
                      }`}
                    >
                      <CreditCard className="h-4 w-4 text-purple-600" />
                      <span>💳 POS</span>
                      {saleType === "pos" && <Badge className="bg-purple-600 text-white text-[9px] py-0 px-1">Selected</Badge>}
                    </button>
                  </div>

                  {saleType === "pos" && (
                    <div className="pt-0.5">
                      <label className="text-[10px] text-muted-foreground">Select POS Terminal *</label>
                      <Select value={posTerminalId} onValueChange={setPosTerminalId}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select POS terminal" />
                        </SelectTrigger>
                        <SelectContent>
                          {(posTerminals || []).length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No active terminals — add in POS & Banks</div>}
                          {(posTerminals || []).map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.label}{t.terminal_id ? ` — ${t.terminal_id}` : ""}{t.bank_name ? ` (${t.bank_name})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {saleType === "transfer" && (
                    <div className="pt-0.5">
                      <label className="text-[10px] text-muted-foreground">Select Bank Account *</label>
                      <Select value={bankAccountId} onValueChange={setBankAccountId}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {(bankAccounts || []).length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No active bank accounts — add in POS & Banks</div>}
                          {(bankAccounts || []).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name} ({b.account_number})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Input className="h-7 text-xs shrink-0" placeholder="Sale note / table # (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

                {/* Totals & Complete Sale */}
                <div className="shrink-0 pt-2 border-t space-y-2 mt-auto">
                  <div className="rounded-lg bg-muted/60 p-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span><strong>{fmt(batchTotal)}</strong></div>
                    {memberDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>Member {memberPct}%:</span><strong>-{fmt(memberDiscount)}</strong></div>}
                    {redeemId && <div className="flex justify-between text-destructive"><span>Reward:</span><strong>-{fmt(rewardDiscount)}</strong></div>}
                    <div className="flex justify-between text-sm pt-1 border-t font-bold">
                      <span>Total Payable:</span>
                      <span className="text-primary font-mono text-base">{fmt(payableTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-10 text-xs px-3" onClick={() => { setOpen(false); resetForm(); }}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      className="flex-1 h-10 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      disabled={saveMutation.isPending || validSaleItems.length === 0 || !branchId || (saleType === "pos" && !posTerminalId) || (saleType === "transfer" && !bankAccountId)}
                    >
                      {saveMutation.isPending ? "Recording Sale..." : `Complete Sale · ${fmt(payableTotal)}`}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
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
