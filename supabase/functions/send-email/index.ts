import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set");
      return json({ error: "Email service not configured" }, 500);
    }
    const RESEND_FROM = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";

    // Require an authenticated caller (any logged-in app user).
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authHeader || !supabaseUrl || !anonKey) {
      return json({ error: "Not authenticated" }, 401);
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return json({ error: "Not authenticated" }, 401);
    }

    const body = await req.json();
    const { to, subject, html, text, from, cc, bcc, reply_to } = body ?? {};

    if (!to || !subject || (!html && !text)) {
      return json({ error: "Missing required fields: to, subject, and html or text" }, 400);
    }

    const payload: Record<string, unknown> = {
      from: from || RESEND_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;
    if (cc) payload.cc = cc;
    if (bcc) payload.bcc = bcc;
    if (reply_to) payload.reply_to = reply_to;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error:", data);
      return json({ error: data?.message || data?.error || "Resend send failed" }, 502);
    }

    return json({ success: true, id: data?.id ?? null });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
