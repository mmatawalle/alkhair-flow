import type { Database, Json } from "@/integrations/supabase/types";

export type AIDraftRow = Database["public"]["Tables"]["ai_drafts"]["Row"];
export type DraftStatus = AIDraftRow["status"];
export type DraftType = AIDraftRow["draft_type"];

export type TransferDraftData = {
  summary?: string;
  transfer: {
    destination: "shop" | "online_shop";
    transfer_date: string;
    note: string;
    items: Array<{
      product_name: string;
      bottle_size: string;
      quantity: number;
      product_id?: string | null;
    }>;
  };
};

export type ProductionDraftData = {
  summary?: string;
  production_batch: {
    production_date: string;
    note: string;
    products: Array<{
      product_name: string;
      bottle_size: string;
      quantity: number;
      product_id?: string | null;
    }>;
    materials: Array<{
      raw_material_name: string;
      quantity_used: number;
      usage_unit: string;
      raw_material_id?: string | null;
    }>;
  };
};

export type PurchaseDraftData = {
  summary?: string;
  purchase: {
    supplier: string;
    purchase_date: string;
    note: string;
    items: Array<{
      raw_material_name: string;
      quantity_purchased: number;
      purchase_unit: string;
      converted_quantity?: number | null;
      unit_cost: number;
      total_cost: number;
      raw_material_id?: string | null;
    }>;
  };
};

export type ExpenseDraftData = {
  summary?: string;
  expense: {
    expense_date: string;
    expense_side: "shop" | "production";
    category_code: string;
    amount: number;
    description: string;
    payment_source: "cash" | "bank" | "pos" | "other";
    requested_by: string;
  };
};

export type UnknownDraftData = {
  summary?: string;
  unknown: {
    reason: string;
    guessed_category: string;
  };
};

export type ValidationResult = {
  status: DraftStatus;
  errors: string[];
  extractedData: Json;
};

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function maybeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function maybeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function defaultIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().split("T")[0];
}

export function validateAndNormalizeDraft(
  draft: Pick<AIDraftRow, "draft_type" | "status" | "extracted_data">,
  products: Database["public"]["Tables"]["products"]["Row"][],
  materials: Database["public"]["Tables"]["raw_materials"]["Row"][],
): ValidationResult {
  const errors: string[] = [];
  const source = (draft.extracted_data || {}) as Record<string, any>;

  if (draft.draft_type === "transfer") {
    const transfer = source.transfer || {};
    const normalized = {
      ...source,
      transfer: {
        destination: transfer.destination === "online_shop" ? "online_shop" : "shop",
        transfer_date: defaultIsoDate(maybeString(transfer.transfer_date)),
        note: maybeString(transfer.note),
        items: Array.isArray(transfer.items)
          ? transfer.items.map((item: any) => {
              const matched = products.find(
                (product) =>
                  normalizeName(product.name) === normalizeName(maybeString(item.product_name)) &&
                  normalizeName(product.bottle_size) === normalizeName(maybeString(item.bottle_size)),
              );
              if (!matched) {
                errors.push(`Unknown product: ${maybeString(item.product_name)} ${maybeString(item.bottle_size)}`.trim());
              }
              if (maybeNumber(item.quantity) <= 0) {
                errors.push(`Invalid quantity for ${maybeString(item.product_name) || "transfer item"}`);
              }
              return {
                product_name: maybeString(item.product_name),
                bottle_size: maybeString(item.bottle_size),
                quantity: maybeNumber(item.quantity),
                product_id: matched?.id || null,
              };
            })
          : [],
      },
    };
    return {
      status: errors.length ? "needs_review" : draft.status === "approved" || draft.status === "posted" ? draft.status : "draft",
      errors,
      extractedData: normalized as Json,
    };
  }

  if (draft.draft_type === "production_batch") {
    const batch = source.production_batch || {};
    const normalized = {
      ...source,
      production_batch: {
        production_date: defaultIsoDate(maybeString(batch.production_date)),
        note: maybeString(batch.note),
        products: Array.isArray(batch.products)
          ? batch.products.map((item: any) => {
              const matched = products.find(
                (product) =>
                  normalizeName(product.name) === normalizeName(maybeString(item.product_name)) &&
                  normalizeName(product.bottle_size) === normalizeName(maybeString(item.bottle_size)),
              );
              if (!matched) errors.push(`Unknown product: ${maybeString(item.product_name)} ${maybeString(item.bottle_size)}`.trim());
              if (maybeNumber(item.quantity) <= 0) errors.push(`Invalid quantity for ${maybeString(item.product_name) || "production product"}`);
              return {
                product_name: maybeString(item.product_name),
                bottle_size: maybeString(item.bottle_size),
                quantity: maybeNumber(item.quantity),
                product_id: matched?.id || null,
              };
            })
          : [],
        materials: Array.isArray(batch.materials)
          ? batch.materials.map((item: any) => {
              const matched = materials.find(
                (material) => normalizeName(material.name) === normalizeName(maybeString(item.raw_material_name)),
              );
              if (!matched) errors.push(`Unknown raw material: ${maybeString(item.raw_material_name)}`);
              if (maybeNumber(item.quantity_used) <= 0) errors.push(`Invalid quantity for ${maybeString(item.raw_material_name) || "material"}`);
              if (matched && maybeString(item.usage_unit) && normalizeName(maybeString(item.usage_unit)) !== normalizeName(matched.usage_unit)) {
                errors.push(`Unit mismatch for ${matched.name}: expected ${matched.usage_unit}`);
              }
              return {
                raw_material_name: maybeString(item.raw_material_name),
                quantity_used: maybeNumber(item.quantity_used),
                usage_unit: maybeString(item.usage_unit) || matched?.usage_unit || "",
                raw_material_id: matched?.id || null,
              };
            })
          : [],
      },
    };
    return {
      status: errors.length ? "needs_review" : draft.status === "approved" || draft.status === "posted" ? draft.status : "draft",
      errors,
      extractedData: normalized as Json,
    };
  }

  if (draft.draft_type === "purchase") {
    const purchase = source.purchase || {};
    const normalized = {
      ...source,
      purchase: {
        supplier: maybeString(purchase.supplier),
        purchase_date: defaultIsoDate(maybeString(purchase.purchase_date)),
        note: maybeString(purchase.note),
        items: Array.isArray(purchase.items)
          ? purchase.items.map((item: any) => {
              const matched = materials.find(
                (material) => normalizeName(material.name) === normalizeName(maybeString(item.raw_material_name)),
              );
              if (!matched) errors.push(`Unknown raw material: ${maybeString(item.raw_material_name)}`);
              if (maybeNumber(item.quantity_purchased) <= 0) errors.push(`Invalid quantity for ${maybeString(item.raw_material_name) || "purchase item"}`);
              if (maybeNumber(item.total_cost) <= 0) errors.push(`Invalid total cost for ${maybeString(item.raw_material_name) || "purchase item"}`);
              if (matched && maybeString(item.purchase_unit) && normalizeName(maybeString(item.purchase_unit)) !== normalizeName(matched.purchase_unit)) {
                errors.push(`Unit mismatch for ${matched.name}: expected purchase unit ${matched.purchase_unit}`);
              }

              let convertedQuantity = item.converted_quantity == null ? null : maybeNumber(item.converted_quantity);
              if (matched && convertedQuantity == null) {
                convertedQuantity =
                  normalizeName(matched.purchase_unit) === normalizeName(matched.usage_unit)
                    ? maybeNumber(item.quantity_purchased)
                    : null;
              }
              if (!convertedQuantity || convertedQuantity <= 0) {
                errors.push(`Converted quantity needed for ${maybeString(item.raw_material_name) || "purchase item"}`);
              }

              return {
                raw_material_name: maybeString(item.raw_material_name),
                quantity_purchased: maybeNumber(item.quantity_purchased),
                purchase_unit: maybeString(item.purchase_unit),
                converted_quantity: convertedQuantity,
                unit_cost: maybeNumber(item.unit_cost),
                total_cost: maybeNumber(item.total_cost),
                raw_material_id: matched?.id || null,
              };
            })
          : [],
      },
    };
    return {
      status: errors.length ? "needs_review" : draft.status === "approved" || draft.status === "posted" ? draft.status : "draft",
      errors,
      extractedData: normalized as Json,
    };
  }

  if (draft.draft_type === "expense") {
    const expense = source.expense || {};
    const normalized = {
      ...source,
      expense: {
        expense_date: defaultIsoDate(maybeString(expense.expense_date)),
        expense_side: expense.expense_side === "production" ? "production" : "shop",
        category_code: maybeString(expense.category_code) || "general",
        amount: maybeNumber(expense.amount),
        description: maybeString(expense.description),
        payment_source: ["cash", "bank", "pos", "other"].includes(maybeString(expense.payment_source))
          ? maybeString(expense.payment_source)
          : "cash",
        requested_by: maybeString(expense.requested_by),
      },
    };
    if (normalized.expense.amount <= 0) errors.push("Expense amount must be greater than zero");
    if (!normalized.expense.description) errors.push("Expense description is required");
    return {
      status: errors.length ? "needs_review" : draft.status === "approved" || draft.status === "posted" ? draft.status : "draft",
      errors,
      extractedData: normalized as Json,
    };
  }

  return {
    status: "needs_review",
    errors: ["Draft could not be classified automatically."],
    extractedData: draft.extracted_data,
  };
}
