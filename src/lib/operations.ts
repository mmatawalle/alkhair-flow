import { supabase } from "@/integrations/supabase/client";

export type PurchaseDraftItem = {
  raw_material_id: string;
  quantity_purchased: number;
  purchase_unit: string;
  converted_quantity: number;
  total_cost: number;
  supplier?: string | null;
  note?: string | null;
};

export type TransferDraftItem = {
  product_id: string;
  quantity: number;
};

export type ProductionDraftProduct = {
  product_id: string;
  quantity: number;
};

export type ProductionDraftMaterial = {
  raw_material_id: string;
  quantity_used: number;
};

export type ExpenseDraftPayload = {
  amount: number;
  category_code: string;
  expense_date: string;
  expense_side: string;
  description?: string | null;
  requested_by?: string | null;
  payment_nature?: string;
  payment_source?: string;
  linked_item?: string | null;
};

export async function postPurchaseDrafts(purchaseDate: string, items: PurchaseDraftItem[]) {
  const valid = items.filter(
    (item) =>
      item.raw_material_id &&
      Number(item.quantity_purchased) > 0 &&
      Number(item.converted_quantity) > 0 &&
      Number(item.total_cost) > 0,
  );

  if (!valid.length) throw new Error("Add at least one valid purchase item");

  for (const item of valid) {
    const cpu = Number(item.total_cost) / Number(item.converted_quantity);

    const { error } = await supabase.from("purchase_records").insert({
      raw_material_id: item.raw_material_id,
      quantity_purchased: item.quantity_purchased,
      purchase_unit: item.purchase_unit,
      converted_quantity: item.converted_quantity,
      total_cost: item.total_cost,
      cost_per_usage_unit: cpu,
      purchase_date: purchaseDate,
      supplier: item.supplier || null,
      note: item.note || null,
    });
    if (error) throw error;

    const materialRes = await supabase.from("raw_materials").select("*").eq("id", item.raw_material_id).single();
    if (materialRes.error) throw materialRes.error;

    const oldStock = Number(materialRes.data.current_stock);
    const oldAvg = Number(materialRes.data.average_cost_per_usage_unit);
    const newAvg = (oldStock * oldAvg + Number(item.total_cost)) / (oldStock + Number(item.converted_quantity));

    const { error: updateError } = await supabase
      .from("raw_materials")
      .update({
        current_stock: oldStock + Number(item.converted_quantity),
        average_cost_per_usage_unit: newAvg,
      })
      .eq("id", item.raw_material_id);

    if (updateError) throw updateError;
  }
}

export async function postTransferDraft(
  productId: string,
  quantity: number,
  destination: "shop" | "online_shop",
  transferDate: string,
  note?: string,
) {
  const productRes = await supabase.from("products").select("*").eq("id", productId).single();
  if (productRes.error) throw productRes.error;

  const product = productRes.data;
  if (quantity <= 0) throw new Error("Quantity must be greater than zero");
  if (quantity > Number(product.production_stock)) {
    throw new Error(`Not enough production stock. Available: ${product.production_stock}`);
  }

  const prefixedNote = note
    ? `[-> ${destination === "online_shop" ? "Online Shop" : "Shop"}] ${note}`
    : `[-> ${destination === "online_shop" ? "Online Shop" : "Shop"}]`;

  const insertRes = await supabase.from("transfer_records").insert({
    product_id: productId,
    quantity_transferred: quantity,
    transfer_date: transferDate,
    note: prefixedNote,
  });
  if (insertRes.error) throw insertRes.error;

  const updateData =
    destination === "online_shop"
      ? {
          production_stock: Number(product.production_stock) - quantity,
          online_shop_stock: Number(product.online_shop_stock) + quantity,
        }
      : {
          production_stock: Number(product.production_stock) - quantity,
          shop_stock: Number(product.shop_stock) + quantity,
        };

  const updateRes = await supabase.from("products").update(updateData).eq("id", productId);
  if (updateRes.error) throw updateRes.error;
}

export async function postProductionDraft(
  productionDate: string,
  note: string,
  products: ProductionDraftProduct[],
  materials: ProductionDraftMaterial[],
) {
  const validProducts = products.filter((entry) => entry.product_id && Number(entry.quantity) > 0);
  const validMaterials = materials.filter((entry) => entry.raw_material_id && Number(entry.quantity_used) > 0);

  if (!validProducts.length) throw new Error("Add at least one product");
  if (!validMaterials.length) throw new Error("Add materials used");

  const productsRes = await supabase.from("products").select("*").eq("is_active", true).order("name");
  if (productsRes.error) throw productsRes.error;
  const materialsRes = await supabase.from("raw_materials").select("*").order("name");
  if (materialsRes.error) throw materialsRes.error;

  const productRows = productsRes.data;
  const materialRows = materialsRes.data;

  for (const usage of validMaterials) {
    const material = materialRows.find((row) => row.id === usage.raw_material_id);
    if (!material) throw new Error("Invalid material");
    if (Number(usage.quantity_used) > Number(material.current_stock)) {
      throw new Error(`Not enough ${material.name}. Available: ${material.current_stock} ${material.usage_unit}`);
    }
  }

  const totalBatchCost = validMaterials.reduce((sum, usage) => {
    const material = materialRows.find((row) => row.id === usage.raw_material_id);
    return sum + Number(usage.quantity_used) * Number(material?.average_cost_per_usage_unit || 0);
  }, 0);

  const totalProductQty = validProducts.reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const costPerUnit = totalProductQty > 0 ? totalBatchCost / totalProductQty : 0;
  const batchCode = `B-${Date.now().toString(36).toUpperCase()}`;
  const primaryProduct = validProducts[0];

  const batchRes = await supabase
    .from("production_batches")
    .insert({
      batch_code: batchCode,
      product_id: primaryProduct.product_id,
      quantity_produced: totalProductQty,
      production_date: productionDate,
      total_batch_cost: totalBatchCost,
      cost_per_unit: costPerUnit,
      note: note || null,
    })
    .select()
    .single();
  if (batchRes.error) throw batchRes.error;

  const batchId = batchRes.data.id;

  const batchProducts = validProducts.map((entry) => ({
    production_batch_id: batchId,
    product_id: entry.product_id,
    quantity_produced: entry.quantity,
    cost_per_unit: costPerUnit,
  }));
  const batchProductsRes = await supabase.from("production_batch_products").insert(batchProducts);
  if (batchProductsRes.error) throw batchProductsRes.error;

  const batchItems = validMaterials.map((usage) => {
    const material = materialRows.find((row) => row.id === usage.raw_material_id)!;
    const unitCost = Number(material.average_cost_per_usage_unit);
    return {
      production_batch_id: batchId,
      raw_material_id: usage.raw_material_id,
      quantity_used: usage.quantity_used,
      unit_cost_used: unitCost,
      total_cost: Number(usage.quantity_used) * unitCost,
    };
  });
  const batchItemsRes = await supabase.from("production_batch_items").insert(batchItems);
  if (batchItemsRes.error) throw batchItemsRes.error;

  for (const usage of validMaterials) {
    const material = materialRows.find((row) => row.id === usage.raw_material_id)!;
    const materialUpdate = await supabase
      .from("raw_materials")
      .update({
        current_stock: Number(material.current_stock) - Number(usage.quantity_used),
      })
      .eq("id", material.id);
    if (materialUpdate.error) throw materialUpdate.error;
  }

  for (const entry of validProducts) {
    const product = productRows.find((row) => row.id === entry.product_id);
    if (!product) throw new Error("Invalid product");

    const totalExisting =
      Number(product.production_stock) + Number(product.shop_stock) + Number(product.online_shop_stock);
    const oldAvg = Number(product.average_cost_per_unit);
    const entryCost = costPerUnit * Number(entry.quantity);
    const newAvg =
      totalExisting > 0
        ? (totalExisting * oldAvg + entryCost) / (totalExisting + Number(entry.quantity))
        : costPerUnit;

    const productUpdate = await supabase
      .from("products")
      .update({
        production_stock: Number(product.production_stock) + Number(entry.quantity),
        latest_cost_per_unit: costPerUnit,
        average_cost_per_unit: newAvg,
      })
      .eq("id", entry.product_id);

    if (productUpdate.error) throw productUpdate.error;
  }
}

export async function postExpenseDraft(payload: ExpenseDraftPayload) {
  if (Number(payload.amount) <= 0) throw new Error("Amount must be greater than zero");

  const insertRes = await supabase.from("expense_records").insert({
    amount: payload.amount,
    category_code: payload.category_code,
    expense_date: payload.expense_date,
    expense_side: payload.expense_side,
    description: payload.description || null,
    requested_by: payload.requested_by || null,
    payment_nature: payload.payment_nature || "normal",
    payment_source: payload.payment_source || "cash",
    linked_item: payload.linked_item || null,
  });

  if (insertRes.error) throw insertRes.error;
}
