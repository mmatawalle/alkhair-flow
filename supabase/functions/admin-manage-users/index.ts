import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("Missing env vars:", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey, hasAnon: !!anonKey });
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is super_admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await callerClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Not authorized. Super admin required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fire-and-forget Resend email. Never blocks the admin action.
    const sendViaResend = async (to: string, subject: string, html: string) => {
      try {
        const apiKey = Deno.env.get("RESEND_API_KEY");
        if (!apiKey || !to) return;
        const from = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: [to], subject, html }),
        });
      } catch (e) {
        console.error("Resend send failed (non-fatal):", e);
      }
    };

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const body = await req.json();
    const { action } = body;

    if (action === "create_user") {
      const { email, password, full_name, role } = body;
      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile name (trigger already created it)
      await adminClient.from("profiles").update({ full_name }).eq("user_id", newUser.user.id);

      // Assign role
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });

      // Notify the new user via Resend (non-blocking for the response).
      await sendViaResend(
        email,
        "Your AL-KHAIR account is ready",
        `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px;">` +
          `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">` +
          `<h2>Welcome, ${esc(full_name)}</h2>` +
          `<p>Your account (<strong>${esc(email)}</strong>) has been created with role <strong>${esc(role)}</strong>.</p>` +
          `<p>Sign in with the temporary password your administrator gave you, then ask them to rotate it if needed.</p>` +
          `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />` +
          `<p style="font-size:12px;color:#888;">AL-KHAIR DRINKS &amp; SNACKS</p>` +
          `</div></body></html>`,
      );

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_users") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profiles } = await adminClient.from("profiles").select("*");
      const { data: roles } = await adminClient.from("user_roles").select("*");

      const combined = users.map((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        const userRoles = roles?.filter((r) => r.user_id === u.id).map((r) => r.role) || [];
        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || "",
          is_active: profile?.is_active ?? true,
          roles: userRoles,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        };
      });

      return new Response(JSON.stringify({ users: combined }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_active") {
      const { user_id, is_active } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("profiles").update({ is_active }).eq("user_id", user_id);

      // Ban/unban in auth
      if (!is_active) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
      } else {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Notify the user via Resend that their password was changed.
      try {
        const { data: target } = await adminClient.auth.admin.getUserById(user_id);
        if (target?.user?.email) {
          await sendViaResend(
            target.user.email,
            "Your AL-KHAIR password was changed",
            `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px;">` +
              `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">` +
              `<h2>Password changed</h2>` +
              `<p>An administrator has reset your AL-KHAIR password. If this wasn't expected, contact your administrator immediately.</p>` +
              `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />` +
              `<p style="font-size:12px;color:#888;">AL-KHAIR DRINKS &amp; SNACKS</p>` +
              `</div></body></html>`,
          );
        }
      } catch (e) {
        console.error("Password-change notify failed (non-fatal):", e);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_role") {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete existing roles and insert new one
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").insert({ user_id, role });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
