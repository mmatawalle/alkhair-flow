import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Ban,
  Factory,
  Beaker,
  Eye,
  Check,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Layers,
  ChevronRight,
  Pencil,
  Image as ImageIcon,
} from "lucide-react";
import { fmt } from "@/lib/stock-helpers";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { fetchBranches, fetchStockMap, seedBranchIds, setBranchQty } from "@/lib/inventory";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getProductImage,
  AL_KHAIR_MENU,
  DRINK_CATEGORIES,
  SNACK_CATEGORIES,
} from "@/lib/alkhair-menu";
import { getMaterialImageFallback } from "@/lib/raw-material-images";

interface MaterialUsage {
  raw_material_id: string;
  quantity_used: number;
}

export default function Production() {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [inspectBatch, setInspectBatch] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productionQty, setProductionQty] = useState<number>(50);
  const [prodDate, setProdDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [usages, setUsages] = useState<MaterialUsage[]>([]);
  const [immediateApproval, setImmediateApproval] = useState(isAdmin);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: materials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return (data || []).map((m: any) => ({
        ...m,
        image_url: m.image_url || getMaterialImageFallback(m.id) || null,
      }));
    },
  });

  const { data: batches, isLoading } = useQuery({
    queryKey: ["production_batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_batches")
        .select("*, products(id, name, bottle_size, category), production_batch_products(product_id, quantity_produced, products(id, name, bottle_size)), production_batch_items(raw_material_id, quantity_used, unit_cost_used, total_cost, raw_materials(name, usage_unit))")
        .order("production_date", { ascending: false });
      if (error) throw error;
      return (data || []).map((b: any) => ({
        ...b,
        status: b.voided ? "rejected" : (b.status || "approved"),
      }));
    },
  });

  const pendingBatches = useMemo(() => {
    return (batches || []).filter((b: any) => b.status === "pending" && !b.voided);
  }, [batches]);

  const filteredBatches = useMemo(() => {
    if (statusFilter === "all") return batches || [];
    return (batches || []).filter((b: any) => b.status === statusFilter);
  }, [batches, statusFilter]);

  // Selected product object
  const selectedProduct = useMemo(() => {
    return products?.find((p: any) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Auto-fill recipe ingredients when a product is selected
  const applyProductRecipe = (productId: string, qty: number) => {
    setSelectedProductId(productId);
    const prod = products?.find((p: any) => p.id === productId);
    if (!prod || !materials) return;

    // Check menu definition for standard recipe
    const menuDef = AL_KHAIR_MENU.find((m) => m.name.toLowerCase().trim() === prod.name.toLowerCase().trim());
    if (menuDef?.default_recipe && menuDef.default_recipe.length > 0) {
      const newUsages: MaterialUsage[] = [];
      for (const rec of menuDef.default_recipe) {
        // Find matching raw material in DB
        const match = materials.find((mat: any) =>
          mat.name.toLowerCase().includes(rec.material_name.toLowerCase()) ||
          rec.material_name.toLowerCase().includes(mat.name.toLowerCase())
        );
        if (match) {
          const calcQty = Math.round((rec.quantity_per_unit * qty) * 100) / 100;
          newUsages.push({
            raw_material_id: match.id,
            quantity_used: Math.max(0.1, calcQty),
          });
        }
      }
      if (newUsages.length > 0) {
        setUsages(newUsages);
        return;
      }
    }

    // Fallback: If no preset recipe, suggest common bottles + caps
    const bottleMat = materials.find((m: any) => m.name.toLowerCase().includes("bottle"));
    const capMat = materials.find((m: any) => m.name.toLowerCase().includes("cap"));
    const defaults: MaterialUsage[] = [];
    if (bottleMat) defaults.push({ raw_material_id: bottleMat.id, quantity_used: qty });
    if (capMat) defaults.push({ raw_material_id: capMat.id, quantity_used: qty });
    setUsages(defaults);
  };

  // When quantity changes, scale existing recipe proportionally if applicable
  const handleQtyChange = (newQty: number) => {
    const validQty = Math.max(1, newQty);
    const oldQty = productionQty || 1;
    setProductionQty(validQty);

    // Scale usages proportionally
    if (usages.length > 0 && oldQty > 0) {
      const ratio = validQty / oldQty;
      setUsages((prev) =>
        prev.map((u) => ({
          ...u,
          quantity_used: Math.round((u.quantity_used * ratio) * 100) / 100,
        }))
      );
    }
  };

  const totalBatchCost = usages.reduce((sum, u) => {
    const mat = materials?.find((m: any) => m.id === u.raw_material_id);
    return sum + (u.quantity_used * Number(mat?.average_cost_per_usage_unit || 0));
  }, 0);
  const costPerUnit = productionQty > 0 ? totalBatchCost / productionQty : 0;

  // Execute inventory deduction and credit finished goods
  const executeDeduction = async (batchId: string, primaryProductId: string, qty: number, items: MaterialUsage[]) => {
    // 1. Deduct raw materials
    for (const u of items) {
      const mat = materials?.find((m: any) => m.id === u.raw_material_id);
      if (mat) {
        const remaining = Number(mat.current_stock) - Number(u.quantity_used);
        await supabase
          .from("raw_materials")
          .update({ current_stock: remaining })
          .eq("id", mat.id);
      }
    }

    // 2. Add finished goods to Production Branch
    const branches = await fetchBranches();
    const prodBranchId = seedBranchIds(branches).prod;
    const stockMap = await fetchStockMap([primaryProductId]);
    const product = products?.find((p: any) => p.id === primaryProductId);

    if (product) {
      const levels = stockMap.get(primaryProductId);
      const totalExisting = levels
        ? [...levels.values()].reduce((s, q) => s + Number(q), 0)
        : Number(product.production_stock) + Number(product.shop_stock) + Number(product.online_shop_stock);

      const oldAvg = Number(product.average_cost_per_unit);
      const entryCost = costPerUnit * qty;
      const newAvg = totalExisting > 0
        ? ((totalExisting * oldAvg) + entryCost) / (totalExisting + qty)
        : costPerUnit;

      await supabase.from("products").update({
        latest_cost_per_unit: costPerUnit,
        average_cost_per_unit: newAvg,
      }).eq("id", primaryProductId);

      const cur = Number(levels?.get(prodBranchId) ?? product.production_stock);
      await setBranchQty(primaryProductId, prodBranchId, "PROD", cur + qty);
    }

    // 3. Mark batch as approved
    await supabase.from("production_batches").update({
      status: "approved",
      approved_by: user?.id || null,
      approved_at: new Date().toISOString(),
    } as any).eq("id", batchId);
  };

  // Submit batch mutation (Creates batch as pending or approved)
  const submitBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProductId) throw new Error("Please select the drink or snack you made");
      if (productionQty <= 0) throw new Error("Please enter how many bottles/pieces were produced");
      if (usages.length === 0) throw new Error("Please specify at least one material/ingredient used");

      const batchCode = `B-${Date.now().toString(36).toUpperCase()}`;
      const shouldApproveNow = isAdmin && immediateApproval;
      const batchStatus = shouldApproveNow ? "approved" : "pending";

      // 1. Create batch record
      const insertPayload: any = {
        batch_code: batchCode,
        product_id: selectedProductId,
        quantity_produced: productionQty,
        production_date: prodDate,
        total_batch_cost: totalBatchCost,
        cost_per_unit: costPerUnit,
        note: note || (shouldApproveNow ? "Approved by Admin" : "Submitted by Kitchen Staff (Pending Approval)"),
        status: batchStatus,
      };

      let { data: batch, error: batchError } = await supabase
        .from("production_batches")
        .insert(insertPayload)
        .select()
        .single();

      // Fallback if status column not yet on remote database
      if (batchError && String(batchError.message).toLowerCase().includes("status")) {
        const { status: _, ...withoutStatus } = insertPayload;
        const res = await supabase.from("production_batches").insert(withoutStatus).select().single();
        if (res.error) throw res.error;
        batch = res.data;
      } else if (batchError) {
        throw batchError;
      }

      // 2. Insert batch products
      await supabase.from("production_batch_products").insert([
        {
          production_batch_id: batch.id,
          product_id: selectedProductId,
          quantity_produced: productionQty,
          cost_per_unit: costPerUnit,
        },
      ]);

      // 3. Insert material items
      const items = usages.map((u) => {
        const mat = materials?.find((m: any) => m.id === u.raw_material_id);
        const unitCost = Number(mat?.average_cost_per_usage_unit || 0);
        return {
          production_batch_id: batch.id,
          raw_material_id: u.raw_material_id,
          quantity_used: u.quantity_used,
          unit_cost_used: unitCost,
          total_cost: u.quantity_used * unitCost,
        };
      });
      await supabase.from("production_batch_items").insert(items);

      // 4. If approved immediately by admin, execute deduction now
      if (shouldApproveNow) {
        await executeDeduction(batch.id, selectedProductId, productionQty, usages);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setOpen(false);
      resetForm();
      toast({
        title: immediateApproval ? "Batch Recorded & Approved ✓" : "Submitted for Boss Approval 🟡",
        description: immediateApproval
          ? "Materials deducted and finished goods added to inventory."
          : "Your production run was saved and is pending boss confirmation.",
      });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Admin approves a pending batch
  const approveBatchMutation = useMutation({
    mutationFn: async (batch: any) => {
      const items: MaterialUsage[] = (batch.production_batch_items || []).map((i: any) => ({
        raw_material_id: i.raw_material_id,
        quantity_used: Number(i.quantity_used),
      }));

      const primaryProdId = batch.product_id;
      const qty = Number(batch.quantity_produced);

      // Check stock before approval
      for (const item of items) {
        const mat = materials?.find((m: any) => m.id === item.raw_material_id);
        if (mat && item.quantity_used > Number(mat.current_stock)) {
          throw new Error(
            `Not enough ${mat.name}. Available: ${mat.current_stock} ${mat.usage_unit}, required: ${item.quantity_used}`
          );
        }
      }

      await executeDeduction(batch.id, primaryProdId, qty, items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setInspectBatch(null);
      toast({
        title: "Batch Approved ✓",
        description: "Raw materials deducted and finished bottles credited to inventory.",
      });
    },
    onError: (e: any) => toast({ title: "Approval Failed", description: e.message, variant: "destructive" }),
  });

  // Admin rejects a pending batch
  const rejectBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await supabase.from("production_batches").update({
        status: "rejected",
        voided: true,
      } as any).eq("id", batchId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      setInspectBatch(null);
      toast({ title: "Batch Rejected", description: "No materials were deducted." });
    },
  });

  // Void already approved batch
  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const batch = batches?.find((b: any) => b.id === id);
      if (!batch) throw new Error("Batch not found");

      await supabase.from("production_batches").update({ voided: true, status: "rejected" } as any).eq("id", id);

      // Restore raw materials
      const { data: batchItems } = await supabase.from("production_batch_items").select("*").eq("production_batch_id", id);
      if (batchItems) {
        for (const item of batchItems) {
          const mat = materials?.find((m: any) => m.id === item.raw_material_id);
          if (mat) {
            await supabase.from("raw_materials").update({
              current_stock: Number(mat.current_stock) + Number(item.quantity_used),
            }).eq("id", mat.id);
          }
        }
      }

      // Reverse finished goods from production branch
      const branches = await fetchBranches();
      const prodBranchId = seedBranchIds(branches).prod;
      const stockMap = await fetchStockMap([batch.product_id]);
      const product = products?.find((p: any) => p.id === batch.product_id);
      const cur = Number(stockMap.get(batch.product_id)?.get(prodBranchId) ?? product?.production_stock ?? 0);
      await setBranchQty(batch.product_id, prodBranchId, "PROD", Math.max(0, cur - Number(batch.quantity_produced)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock_levels"] });
      setVoidId(null);
      toast({ title: "Batch voided ✓", description: "Materials restored and finished stock reversed." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setSelectedProductId("");
    setProductionQty(50);
    setNote("");
    setUsages([]);
    setProdDate(new Date().toISOString().split("T")[0]);
    setImmediateApproval(isAdmin);
  };

  const addUsage = (rawMatId: string) => {
    if (usages.some((u) => u.raw_material_id === rawMatId)) return;
    setUsages([...usages, { raw_material_id: rawMatId, quantity_used: 1 }]);
  };

  const removeUsage = (rawMatId: string) => {
    setUsages(usages.filter((u) => u.raw_material_id !== rawMatId));
  };

  const updateUsageQty = (rawMatId: string, qty: number) => {
    setUsages(
      usages.map((u) => (u.raw_material_id === rawMatId ? { ...u, quantity_used: Math.max(0, qty) } : u))
    );
  };

  const adjustUsageDelta = (rawMatId: string, delta: number) => {
    setUsages(
      usages.map((u) =>
        u.raw_material_id === rawMatId
          ? { ...u, quantity_used: Math.max(0, Math.round((u.quantity_used + delta) * 100) / 100) }
          : u
      )
    );
  };

  // Filter products by selected category in visual logger
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedCategory === "All") return products;
    if (selectedCategory === "Drinks") return products.filter((p: any) => DRINK_CATEGORIES.includes(p.category));
    if (selectedCategory === "Snacks") return products.filter((p: any) => SNACK_CATEGORIES.includes(p.category));
    return products.filter((p: any) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Production</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log kitchen production runs, track batch costs, and review approvals
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="w-full sm:w-auto font-bold shadow-sm h-10 px-5 text-sm"
        >
          <Plus className="mr-2 h-4 w-4" /> Record Production Run
        </Button>
      </div>

      {/* PENDING APPROVAL NOTIFICATION BANNER (For Boss / Admin) */}
      {pendingBatches.length > 0 && (
        <Card className="border-2 border-amber-500/60 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-background shadow-md">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                    <span>{pendingBatches.length} Production Run{pendingBatches.length > 1 ? "s" : ""} Awaiting Confirmation</span>
                    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-500/10 text-xs">
                      Pending
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Logged by kitchen staff. Review ingredients used and approve to update stock.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setInspectBatch(pendingBatches[0])}
                  className="w-full sm:w-auto font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Review First Batch ({pendingBatches[0].batch_code})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Filter Tabs */}
      <div className="filter-bar flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: "All Runs" },
              { id: "pending", label: `Pending (${pendingBatches.length})` },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected / Voided" },
            ] as const
          ).map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={statusFilter === t.id ? "default" : "outline"}
              onClick={() => setStatusFilter(t.id as any)}
              className="text-xs h-8 px-3 font-semibold"
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Production History - Mobile Cards */}
      <MobileList>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading batches...</p>
        ) : filteredBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No production records found</p>
        ) : (
          filteredBatches.map((b: any) => {
            const isPending = b.status === "pending" && !b.voided;
            const isApproved = b.status === "approved" && !b.voided;
            const isRejected = b.voided || b.status === "rejected";
            const prod = b.products;
            const img = prod ? getProductImage(prod.id, prod.name) : undefined;

            return (
              <MobileListItem
                key={b.id}
                avatarFallback={prod?.name || "Batch"}
                avatarSrc={img}
                supportingIcon={
                  isPending ? (
                    <Clock className="h-3 w-3 text-amber-500" />
                  ) : isApproved ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )
                }
                heading={prod ? `${prod.name} (${prod.bottle_size})` : b.batch_code}
                caption={`${b.production_date} · Qty: ${b.quantity_produced} · Cost: ${fmt(b.total_batch_cost)}`}
                meta={`Unit Cost: ${isApproved ? fmt(b.cost_per_unit) : "Pending"}`}
                trailing={
                  isPending ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10 text-xs font-bold">
                      Pending
                    </Badge>
                  ) : isApproved ? (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-500/10 text-xs font-bold">
                      Approved
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Voided
                    </Badge>
                  )
                }
                actions={[
                  {
                    id: "inspect",
                    label: "Inspect Batch & Ingredients",
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => setInspectBatch(b),
                  },
                  ...(isPending && isAdmin
                    ? [
                        {
                          id: "approve",
                          label: "Approve & Deduct Stock",
                          icon: <Check className="h-4 w-4 text-emerald-600" />,
                          onClick: () => approveBatchMutation.mutate(b),
                        },
                        {
                          id: "reject",
                          label: "Reject Batch",
                          icon: <Ban className="h-4 w-4 text-destructive" />,
                          onClick: () => rejectBatchMutation.mutate(b.id),
                          variant: "destructive" as const,
                        },
                      ]
                    : []),
                  ...(isApproved && isAdmin
                    ? [
                        {
                          id: "void",
                          label: "Void Batch (Reverse Stock)",
                          icon: <Ban className="h-4 w-4 text-destructive" />,
                          onClick: () => setVoidId(b.id),
                          variant: "destructive" as const,
                        },
                      ]
                    : []),
                ]}
              />
            );
          })
        )}
      </MobileList>

      {/* Production History - Desktop Table */}
      <div className="desktop-table">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-center">Photo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Batch Code</TableHead>
                    <TableHead>Product Made</TableHead>
                    <TableHead>Qty Produced</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Cost / Unit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">Loading batches...</TableCell>
                    </TableRow>
                  ) : filteredBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No production records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBatches.map((b: any) => {
                      const isPending = b.status === "pending" && !b.voided;
                      const isApproved = b.status === "approved" && !b.voided;
                      const prod = b.products;
                      const img = prod ? getProductImage(prod.id, prod.name) : undefined;

                      return (
                        <TableRow key={b.id} className={b.voided ? "opacity-50" : ""}>
                          <TableCell className="text-center p-2">
                            {img ? (
                              <img
                                src={img}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover border border-border mx-auto shadow-xs"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto text-xs font-bold text-muted-foreground">
                                DR
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPending ? (
                              <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10 font-bold text-xs">
                                🟡 Pending Boss
                              </Badge>
                            ) : isApproved ? (
                              <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-500/10 font-bold text-xs">
                                🟢 Approved
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                🔴 Voided
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{b.production_date}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{b.batch_code}</TableCell>
                          <TableCell className="font-bold text-foreground">
                            {prod ? `${prod.name} (${prod.bottle_size})` : "—"}
                          </TableCell>
                          <TableCell className="font-bold text-sm">{b.quantity_produced} units</TableCell>
                          <TableCell>{fmt(b.total_batch_cost)}</TableCell>
                          <TableCell>{isApproved ? fmt(b.cost_per_unit) : "Pending"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setInspectBatch(b)}
                                className="h-8 text-xs px-2.5 font-semibold"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" /> View
                              </Button>
                              {isPending && isAdmin && (
                                <Button
                                  size="sm"
                                  onClick={() => approveBatchMutation.mutate(b)}
                                  className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> Approve
                                </Button>
                              )}
                              {isApproved && isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setVoidId(b.id)}
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Void batch"
                                >
                                  <Ban className="h-4 w-4" />
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

      {/* ==================== VISUAL KIOSK PRODUCTION LOGGER MODAL ==================== */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
              <Factory className="h-5 w-5 text-primary" />
              <span>Record Production Run</span>
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitBatchMutation.mutate();
            }}
            className="space-y-6 pt-2"
          >
            {/* STEP 1: WHAT DID YOU MAKE TODAY? (VISUAL DRINK SELECTOR) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  What did you cook / make? (Tap picture)
                </label>
                {selectedProduct && (
                  <span className="text-xs font-bold text-primary flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Selected: {selectedProduct.name}
                  </span>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {["All", "Native Series", "Drinks", "Snacks"].map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    size="sm"
                    variant={selectedCategory === cat ? "default" : "outline"}
                    onClick={() => setSelectedCategory(cat)}
                    className="h-7 text-xs px-2.5 font-semibold shrink-0"
                  >
                    {cat}
                  </Button>
                ))}
              </div>

              {/* Visual Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1 border rounded-xl bg-muted/20 scrollbar-thin">
                {filteredProducts.map((p: any) => {
                  const isSelected = selectedProductId === p.id;
                  const img = getProductImage(p.id, p.name);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyProductRecipe(p.id, productionQty)}
                      className={`relative flex flex-col items-center p-2 rounded-xl border text-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary/15 ring-2 ring-primary shadow-md"
                          : "border-border/80 bg-card hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted mb-2 relative">
                        <img src={img} alt={p.name} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold text-foreground line-clamp-1">{p.name}</p>
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {p.bottle_size} · {fmt(p.selling_price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: HOW MANY BOTTLES / PIECES WERE PRODUCED? */}
            {selectedProductId && (
              <div className="space-y-3 p-4 rounded-xl border border-border/80 bg-card shadow-xs animate-in fade-in duration-200">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  How many bottles or pieces did you make?
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleQtyChange(productionQty - 10)}
                      className="h-12 w-12 text-base font-bold shrink-0"
                    >
                      -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleQtyChange(productionQty - 1)}
                      className="h-12 w-12 text-lg font-bold shrink-0"
                    >
                      -1
                    </Button>
                    <div className="flex-1 text-center min-w-[120px]">
                      <Input
                        type="number"
                        min={1}
                        value={productionQty || ""}
                        onChange={(e) => handleQtyChange(Number(e.target.value))}
                        className="h-12 text-center text-xl font-extrabold"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleQtyChange(productionQty + 1)}
                      className="h-12 w-12 text-lg font-bold shrink-0"
                    >
                      +1
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleQtyChange(productionQty + 10)}
                      className="h-12 w-12 text-base font-bold shrink-0"
                    >
                      +10
                    </Button>
                  </div>

                  {/* Quick Crate Taps */}
                  <div className="flex gap-1.5 flex-wrap w-full sm:w-auto justify-center">
                    {[24, 48, 50, 100, 200].map((quick) => (
                      <Button
                        key={quick}
                        type="button"
                        size="sm"
                        variant={productionQty === quick ? "default" : "secondary"}
                        onClick={() => handleQtyChange(quick)}
                        className="h-8 text-xs font-bold px-2.5"
                      >
                        {quick === 24 ? "1 Crate (24)" : quick === 48 ? "2 Crates (48)" : `${quick} pcs`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: RAW MATERIALS USED (ALL WITH PICTURES!) */}
            {selectedProductId && (
              <div className="space-y-3 p-4 rounded-xl border border-border/80 bg-card shadow-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    Materials Used (Adjust quantities with + / -)
                  </label>
                  <span className="text-xs font-bold text-foreground">
                    Est. Cost: {fmt(totalBatchCost)} ({fmt(costPerUnit)}/unit)
                  </span>
                </div>

                {/* Recipe Materials List */}
                <div className="space-y-2.5">
                  {usages.map((u) => {
                    const mat = materials?.find((m: any) => m.id === u.raw_material_id);
                    if (!mat) return null;
                    return (
                      <div
                        key={u.raw_material_id}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-border/80 bg-muted/20"
                      >
                        {/* Ingredient Photo */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-border bg-card shrink-0">
                          {mat.image_url ? (
                            <img src={mat.image_url} alt={mat.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                              {mat.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Name and Stock */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{mat.name}</p>
                          <span className="text-[10px] text-muted-foreground block">
                            Left: {mat.current_stock} {mat.usage_unit} · {fmt(mat.average_cost_per_usage_unit)}/{mat.usage_unit}
                          </span>
                        </div>

                        {/* Big Touch Stepper for Low-Literacy Kitchen Staff */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => adjustUsageDelta(u.raw_material_id, -0.5)}
                            className="h-8 w-8 text-base font-bold"
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            step="any"
                            min={0}
                            value={u.quantity_used || ""}
                            onChange={(e) => updateUsageQty(u.raw_material_id, Number(e.target.value))}
                            className="w-16 h-8 text-center text-xs font-bold px-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => adjustUsageDelta(u.raw_material_id, 0.5)}
                            className="h-8 w-8 text-base font-bold"
                          >
                            +
                          </Button>
                          <span className="text-[11px] font-semibold text-muted-foreground w-10 text-left pl-1 truncate">
                            {mat.usage_unit}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUsage(u.raw_material_id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            title="Remove ingredient"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Extra Ingredient Picker */}
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    + Tap to add extra spices, sugar, bottles or ingredients:
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                    {materials
                      ?.filter((m: any) => !usages.some((u) => u.raw_material_id === m.id))
                      .map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => addUsage(m.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/70 bg-card hover:border-primary/60 text-xs font-medium shrink-0 transition-colors"
                        >
                          {m.image_url && (
                            <img src={m.image_url} alt="" className="w-5 h-5 rounded object-cover" />
                          )}
                          <span>+ {m.name.split(" (")[0]}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Date & Optional Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Production Date</label>
                <Input type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Kitchen Note (optional)</label>
                <Input
                  placeholder="e.g. Morning batch, extra ginger flavor"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Admin Immediate Approval Toggle */}
            {isAdmin && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
                <input
                  type="checkbox"
                  id="immediate-approval"
                  checked={immediateApproval}
                  onChange={(e) => setImmediateApproval(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary"
                />
                <label htmlFor="immediate-approval" className="text-xs font-semibold text-foreground cursor-pointer">
                  Boss Immediate Approval: Deduct raw materials and credit finished stock right now
                </label>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitBatchMutation.isPending || !selectedProductId}
                className="font-bold text-sm h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              >
                <Check className="mr-2 h-4 w-4" />
                {submitBatchMutation.isPending
                  ? "Saving Run..."
                  : immediateApproval
                  ? "Approve & Record Batch (Deduct Stock Now)"
                  : "✓ Submit for Boss Approval"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ==================== BATCH INSPECTION & APPROVAL LIGHTBOX ==================== */}
      <Dialog open={!!inspectBatch} onOpenChange={(v) => !v && setInspectBatch(null)}>
        <DialogContent className="max-w-lg p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-4">
              <div className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-primary" />
                <span className="font-bold">{inspectBatch?.batch_code}</span>
              </div>
              {inspectBatch?.status === "pending" && !inspectBatch?.voided && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-500/10 font-bold text-xs">
                  🟡 Pending Approval
                </Badge>
              )}
              {inspectBatch?.status === "approved" && !inspectBatch?.voided && (
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-500/10 font-bold text-xs">
                  🟢 Approved
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {inspectBatch && (
            <div className="space-y-4 pt-1">
              {/* Product Hero */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                <img
                  src={
                    inspectBatch.products
                      ? getProductImage(inspectBatch.products.id, inspectBatch.products.name)
                      : undefined
                  }
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover border border-border shadow-xs shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-base text-foreground">
                    {inspectBatch.products?.name} ({inspectBatch.products?.bottle_size})
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quantity: <strong className="text-foreground">{inspectBatch.quantity_produced} units</strong> · Date: {inspectBatch.production_date}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total Cost: <strong className="text-foreground">{fmt(inspectBatch.total_batch_cost)}</strong> ({fmt(inspectBatch.cost_per_unit)}/unit)
                  </p>
                </div>
              </div>

              {/* Ingredients Breakdown with Pictures */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Materials Used in this Batch:
                </h5>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {(inspectBatch.production_batch_items || []).map((item: any, i: number) => {
                    const mat = materials?.find((m: any) => m.id === item.raw_material_id);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg border border-border/70 bg-card text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md overflow-hidden bg-muted shrink-0 border border-border/60">
                            {mat?.image_url ? (
                              <img src={mat.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-bold text-muted-foreground flex items-center justify-center w-full h-full">
                                MAT
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-foreground">
                            {item.raw_materials?.name || mat?.name || "Raw Material"}
                          </span>
                        </div>
                        <span className="font-bold text-foreground">
                          {item.quantity_used} {item.raw_materials?.usage_unit || mat?.usage_unit || "units"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons for Boss */}
              <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
                {inspectBatch.status === "pending" && !inspectBatch.voided && isAdmin && (
                  <div className="flex items-center justify-between w-full gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => rejectBatchMutation.mutate(inspectBatch.id)}
                      disabled={rejectBatchMutation.isPending}
                      className="font-bold"
                    >
                      Reject Run
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => approveBatchMutation.mutate(inspectBatch)}
                      disabled={approveBatchMutation.isPending}
                      className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {approveBatchMutation.isPending ? "Approving..." : "Approve & Deduct Stock"}
                    </Button>
                  </div>
                )}
                {inspectBatch.status === "approved" && !inspectBatch.voided && isAdmin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInspectBatch(null);
                      setVoidId(inspectBatch.id);
                    }}
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" /> Void this Approved Batch
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Confirmation */}
      <AlertDialog open={!!voidId} onOpenChange={() => setVoidId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this production batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all used raw materials back into inventory and reverse finished goods from stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => voidId && voidMutation.mutate(voidId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            >
              Void Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
