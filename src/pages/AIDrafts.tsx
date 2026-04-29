import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { postExpenseDraft, postProductionDraft, postPurchaseDrafts, postTransferDraft } from "@/lib/operations";
import { validateAndNormalizeDraft, type AIDraftRow } from "@/lib/ai-drafts";
import { logAudit } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Eye, FileUp, Sparkles, XCircle, CheckCircle2, Upload, Send } from "lucide-react";

type SourceType = "text" | "image" | "pdf";

const DRAFT_TYPES = ["transfer", "production_batch", "purchase", "expense", "unknown"] as const;
const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  needs_review: "destructive",
  approved: "default",
  rejected: "secondary",
  posted: "secondary",
};

function prettyConfidence(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

async function toDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function AIDrafts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewDraft, setViewDraft] = useState<AIDraftRow | null>(null);
  const [editorValue, setEditorValue] = useState("");

  const { data: drafts, isLoading } = useQuery({
    queryKey: ["ai_drafts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_drafts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rawMaterials } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const normalizedDrafts = useMemo(() => {
    if (!drafts || !products || !rawMaterials) return [];
    return drafts.map((draft) => {
      const validation = validateAndNormalizeDraft(draft, products, rawMaterials);
      return {
        ...draft,
        status: draft.status === "posted" || draft.status === "rejected" ? draft.status : validation.status,
        extracted_data: validation.extractedData,
        validationErrors: validation.errors,
      };
    });
  }, [drafts, products, rawMaterials]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (sourceType === "text" && !textInput.trim()) {
        throw new Error("Paste some text first");
      }
      if (sourceType !== "text" && !selectedFile) {
        throw new Error("Choose a file first");
      }

      const rawInput =
        sourceType === "text"
          ? textInput.trim()
          : await toDataUrl(selectedFile as File);

      const extraction = await supabase.functions.invoke("ai-draft-assistant", {
        body: {
          source_type: sourceType,
          raw_input: rawInput,
          file_name: selectedFile?.name,
          mime_type: selectedFile?.type,
        },
      });
      if (extraction.error) throw extraction.error;

      const validation = validateAndNormalizeDraft(
        {
          draft_type: extraction.data.draft_type,
          status: extraction.data.status,
          extracted_data: extraction.data.extracted_data,
        } as Pick<AIDraftRow, "draft_type" | "status" | "extracted_data">,
        products || [],
        rawMaterials || [],
      );

      const { data, error } = await supabase
        .from("ai_drafts")
        .insert({
          draft_type: extraction.data.draft_type,
          source_type: sourceType,
          raw_input: extraction.data.raw_input_preview,
          extracted_data: validation.extractedData,
          status: validation.status,
          confidence: extraction.data.confidence,
        })
        .select("*")
        .single();
      if (error) throw error;

      await logAudit({
        action_type: "create",
        module: "ai_drafts",
        record_id: data.id,
        note: `Created ${data.draft_type} AI draft`,
      });

      return data;
    },
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ["ai_drafts"] });
      setTextInput("");
      setSelectedFile(null);
      setViewDraft(draft);
      setEditorValue(JSON.stringify(draft.extracted_data, null, 2));
      toast({ title: "Draft created", description: "Review and approve it before posting." });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, extractedData, status }: { id: string; extractedData: any; status?: string }) => {
      const validation = validateAndNormalizeDraft(
        {
          draft_type: viewDraft!.draft_type,
          status: status || viewDraft!.status,
          extracted_data: extractedData,
        } as Pick<AIDraftRow, "draft_type" | "status" | "extracted_data">,
        products || [],
        rawMaterials || [],
      );

      const { data, error } = await supabase
        .from("ai_drafts")
        .update({
          extracted_data: validation.extractedData,
          status: status === "rejected" || status === "posted" ? status : validation.status,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return { draft: data, errors: validation.errors };
    },
    onSuccess: ({ draft, errors }) => {
      qc.invalidateQueries({ queryKey: ["ai_drafts"] });
      setViewDraft(draft);
      setEditorValue(JSON.stringify(draft.extracted_data, null, 2));
      toast({
        title: "Draft updated",
        description: errors.length ? "Still needs review before posting." : "Draft looks ready.",
      });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const postDraftMutation = useMutation({
    mutationFn: async (draft: AIDraftRow) => {
      const validation = validateAndNormalizeDraft(draft, products || [], rawMaterials || []);
      if (validation.errors.length) {
        throw new Error(validation.errors[0]);
      }

      const data = validation.extractedData as any;

      if (draft.draft_type === "transfer") {
        const transfer = data.transfer;
        for (const item of transfer.items) {
          await postTransferDraft(
            item.product_id,
            Number(item.quantity),
            transfer.destination,
            transfer.transfer_date,
            transfer.note,
          );
        }
      } else if (draft.draft_type === "production_batch") {
        const batch = data.production_batch;
        await postProductionDraft(
          batch.production_date,
          batch.note,
          batch.products.map((item: any) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity),
          })),
          batch.materials.map((item: any) => ({
            raw_material_id: item.raw_material_id,
            quantity_used: Number(item.quantity_used),
          })),
        );
      } else if (draft.draft_type === "purchase") {
        const purchase = data.purchase;
        await postPurchaseDrafts(
          purchase.purchase_date,
          purchase.items.map((item: any) => ({
            raw_material_id: item.raw_material_id,
            quantity_purchased: Number(item.quantity_purchased),
            purchase_unit: item.purchase_unit,
            converted_quantity: Number(item.converted_quantity),
            total_cost: Number(item.total_cost),
            supplier: purchase.supplier || null,
            note: purchase.note || null,
          })),
        );
      } else if (draft.draft_type === "expense") {
        const expense = data.expense;
        await postExpenseDraft({
          amount: Number(expense.amount),
          category_code: expense.category_code,
          expense_date: expense.expense_date,
          expense_side: expense.expense_side,
          description: expense.description,
          payment_source: expense.payment_source,
          requested_by: expense.requested_by,
          payment_nature: "normal",
        });
      } else {
        throw new Error("Unknown drafts cannot be posted");
      }

      const { error } = await supabase.from("ai_drafts").update({ status: "posted" }).eq("id", draft.id);
      if (error) throw error;

      await logAudit({
        action_type: "create",
        module: "ai_drafts",
        record_id: draft.id,
        note: `Posted ${draft.draft_type} AI draft`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai_drafts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
      qc.invalidateQueries({ queryKey: ["purchase_records"] });
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["transfer_records"] });
      qc.invalidateQueries({ queryKey: ["expense_records"] });
      toast({ title: "Draft posted", description: "The confirmed draft was posted using the normal app flow." });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const currentDraft = viewDraft
    ? normalizedDrafts.find((draft) => draft.id === viewDraft.id) || viewDraft
    : null;

  const handleOpenDraft = (draft: AIDraftRow) => {
    setViewDraft(draft);
    setEditorValue(JSON.stringify(draft.extracted_data, null, 2));
  };

  const handleSaveDraft = async () => {
    if (!viewDraft) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorValue);
    } catch {
      toast({ title: "Invalid JSON", description: "Please fix the draft JSON first.", variant: "destructive" });
      return;
    }
    updateDraftMutation.mutate({ id: viewDraft.id, extractedData: parsed });
  };

  return (
    <div className="page-container space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">AI Drafts</h2>
          <p className="text-sm text-muted-foreground">AI only prepares drafts. Nothing posts until you approve and post it yourself.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_1fr] md:items-end">
            <div>
              <Label>Source type</Label>
              <Select value={sourceType} onValueChange={(value: SourceType) => { setSourceType(value); setSelectedFile(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sourceType === "text" ? (
              <div>
                <Label>Paste note or receipt text</Label>
                <Textarea
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  placeholder="Coconut 50cl - 40, Zobo 35cl - 25"
                  className="min-h-28"
                />
              </div>
            ) : (
              <div>
                <Label>Upload {sourceType === "image" ? "receipt image" : "PDF"}</Label>
                <Input
                  type="file"
                  accept={sourceType === "image" ? "image/*" : "application/pdf"}
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
                {selectedFile && <p className="mt-2 text-sm text-muted-foreground">{selectedFile.name}</p>}
              </div>
            )}
          </div>
          <Button onClick={() => extractMutation.mutate()} disabled={extractMutation.isPending}>
            {extractMutation.isPending ? "Extracting..." : <><Sparkles className="mr-2 h-4 w-4" />Create AI Draft</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Draft Inbox</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                ) : normalizedDrafts.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No drafts yet.</TableCell></TableRow>
                ) : normalizedDrafts.map((draft: any) => (
                  <TableRow key={draft.id}>
                    <TableCell className="capitalize">{draft.draft_type.replace(/_/g, " ")}</TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[draft.status] || "outline"}>{draft.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{prettyConfidence(draft.confidence)}</TableCell>
                    <TableCell className="capitalize">{draft.source_type}</TableCell>
                    <TableCell>{new Date(draft.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDraft(draft)} title="View draft">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {draft.status !== "rejected" && draft.status !== "posted" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Approve"
                              onClick={() => updateDraftMutation.mutate({ id: draft.id, extractedData: draft.extracted_data, status: "approved" })}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reject"
                              onClick={() => updateDraftMutation.mutate({ id: draft.id, extractedData: draft.extracted_data, status: "rejected" })}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Post"
                              onClick={() => postDraftMutation.mutate(draft)}
                              disabled={draft.status !== "approved"}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!currentDraft} onOpenChange={(open) => !open && setViewDraft(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">AI Draft: {currentDraft?.draft_type.replace(/_/g, " ")}</DialogTitle>
          </DialogHeader>
          {currentDraft && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                    <p className="mt-2 text-sm font-medium">{currentDraft.status.replace(/_/g, " ")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Confidence</p>
                    <p className="mt-2 text-sm font-medium">{prettyConfidence(currentDraft.confidence)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Source</p>
                    <p className="mt-2 text-sm font-medium capitalize">{currentDraft.source_type}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <Label>Raw input</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                  {currentDraft.raw_input}
                </div>
              </div>

              {(() => {
                const errs = (currentDraft as any).validationErrors as string[] | undefined;
                if (!errs || errs.length === 0) return null;
                return (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                    <p className="text-sm font-medium text-destructive">Needs review before posting</p>
                    <ul className="mt-2 space-y-1 text-sm text-destructive">
                      {errs.map((error: string) => (
                        <li key={error}>- {error}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <Label>Extracted draft data</Label>
                <Textarea value={editorValue} onChange={(event) => setEditorValue(event.target.value)} className="min-h-[320px] font-mono text-xs" />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleSaveDraft} disabled={updateDraftMutation.isPending}>
                  <FileUp className="mr-2 h-4 w-4" />Save edits
                </Button>
                {currentDraft.status !== "posted" && currentDraft.status !== "rejected" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        let parsed: any;
                        try {
                          parsed = JSON.parse(editorValue);
                        } catch {
                          toast({ title: "Invalid JSON", description: "Please fix the draft JSON first.", variant: "destructive" });
                          return;
                        }
                        updateDraftMutation.mutate({ id: currentDraft.id, extractedData: parsed, status: "approved" });
                      }}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />Approve
                    </Button>
                    <Button
                      onClick={() => postDraftMutation.mutate(currentDraft)}
                      disabled={currentDraft.status !== "approved" || postDraftMutation.isPending}
                    >
                      <Upload className="mr-2 h-4 w-4" />Post draft
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
