import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import OpenAI from "https://esm.sh/openai@4.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DraftType = "transfer" | "production_batch" | "purchase" | "expense" | "unknown";
type SourceType = "text" | "image" | "pdf";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      draft_type: {
        type: "string",
        enum: ["transfer", "production_batch", "purchase", "expense", "unknown"],
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      needs_review: { type: "boolean" },
      summary: { type: "string" },
      transfer: {
        type: "object",
        additionalProperties: false,
        properties: {
          destination: { type: "string", enum: ["shop", "online_shop"] },
          transfer_date: { type: "string" },
          note: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                product_name: { type: "string" },
                bottle_size: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["product_name", "bottle_size", "quantity"],
            },
          },
        },
        required: ["destination", "transfer_date", "note", "items"],
      },
      production_batch: {
        type: "object",
        additionalProperties: false,
        properties: {
          production_date: { type: "string" },
          note: { type: "string" },
          products: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                product_name: { type: "string" },
                bottle_size: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["product_name", "bottle_size", "quantity"],
            },
          },
          materials: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                raw_material_name: { type: "string" },
                quantity_used: { type: "number" },
                usage_unit: { type: "string" },
              },
              required: ["raw_material_name", "quantity_used", "usage_unit"],
            },
          },
        },
        required: ["production_date", "note", "products", "materials"],
      },
      purchase: {
        type: "object",
        additionalProperties: false,
        properties: {
          supplier: { type: "string" },
          purchase_date: { type: "string" },
          note: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                raw_material_name: { type: "string" },
                quantity_purchased: { type: "number" },
                purchase_unit: { type: "string" },
                unit_cost: { type: "number" },
                total_cost: { type: "number" },
              },
              required: ["raw_material_name", "quantity_purchased", "purchase_unit", "unit_cost", "total_cost"],
            },
          },
        },
        required: ["supplier", "purchase_date", "note", "items"],
      },
      expense: {
        type: "object",
        additionalProperties: false,
        properties: {
          expense_date: { type: "string" },
          expense_side: { type: "string", enum: ["shop", "production"] },
          category_code: { type: "string" },
          amount: { type: "number" },
          description: { type: "string" },
          payment_source: { type: "string", enum: ["cash", "bank", "pos", "other"] },
          requested_by: { type: "string" },
        },
        required: ["expense_date", "expense_side", "category_code", "amount", "description", "payment_source", "requested_by"],
      },
      unknown: {
        type: "object",
        additionalProperties: false,
        properties: {
          reason: { type: "string" },
          guessed_category: { type: "string" },
        },
        required: ["reason", "guessed_category"],
      },
    },
    required: ["draft_type", "confidence", "needs_review", "summary", "transfer", "production_batch", "purchase", "expense", "unknown"],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    // TEMP debug check (do not log the key)
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Missing Supabase environment" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing auth" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      console.error("Auth validation failed:", userError);
      return jsonResponse({ error: "Not authenticated" }, 401);
    }
    const user = userData.user;

    const openai = new OpenAI({ apiKey });

    const { source_type, raw_input, file_name, mime_type } = await req.json() as {
      source_type: SourceType;
      raw_input: string;
      file_name?: string;
      mime_type?: string;
    };

    if (!source_type || !raw_input) {
      return jsonResponse({ error: "Missing source_type or raw_input" }, 400);
    }

    const systemPrompt = [
      "You are an extraction assistant for a small operations app.",
      "Return JSON only.",
      "Classify into exactly one draft_type: transfer, production_batch, purchase, expense, or unknown.",
      "Raw material receipts must be treated as purchase drafts, never payables.",
      "Transfers are production stock moved to shop or online_shop.",
      "Production drafts include products produced and raw materials used.",
      "Expenses are non-stock spending only.",
      "If uncertain, keep values conservative and set needs_review to true.",
      "Dates should be ISO yyyy-mm-dd when possible; otherwise use empty string.",
      "For unknown sections, still fill the required object with a concise reason.",
      "Never invent missing quantities with high confidence.",
    ].join(" ");

    const inputContent: Array<Record<string, unknown>> = [
      { type: "input_text", text: systemPrompt },
    ];

    if (source_type === "text") {
      inputContent.push({ type: "input_text", text: raw_input });
    } else if (source_type === "image") {
      inputContent.push({
        type: "input_text",
        text: `This is an uploaded image file${file_name ? ` named ${file_name}` : ""}. Extract operational draft data from it.`,
      });
      inputContent.push({
        type: "input_image",
        image_url: raw_input,
      });
    } else {
      inputContent.push({
        type: "input_text",
        text: `This is an uploaded PDF${file_name ? ` named ${file_name}` : ""}. Extract operational draft data from it.`,
      });
      inputContent.push({
        type: "input_file",
        filename: file_name || "upload.pdf",
        file_data: raw_input.replace(/^data:application\/pdf;base64,/, ""),
      });
    }

    const model = Deno.env.get("OPENAI_DRAFT_MODEL") || "gpt-4o-mini";
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: inputContent as any,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ai_draft_extraction",
          strict: true,
          schema: getSchema(),
        },
      },
    });

    // Structured JSON only
    const parsed = JSON.parse(response.output_text) as {
      draft_type: DraftType;
      confidence: number;
      needs_review: boolean;
      summary: string;
      transfer: Record<string, unknown>;
      production_batch: Record<string, unknown>;
      purchase: Record<string, unknown>;
      expense: Record<string, unknown>;
      unknown: Record<string, unknown>;
    };

    return jsonResponse({
      draft_type: parsed.draft_type,
      confidence: parsed.confidence,
      status: parsed.needs_review ? "needs_review" : "draft",
      extracted_data: parsed,
      source_type,
      raw_input_preview:
        source_type === "text"
          ? raw_input
          : `Uploaded ${mime_type || source_type}${file_name ? `: ${file_name}` : ""}`,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
