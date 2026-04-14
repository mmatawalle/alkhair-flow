import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  action_type: string;
  module: string;
  record_id?: string;
  performed_by?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  note?: string;
}

export async function logAudit(entry: AuditEntry) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let performedBy = entry.performed_by || user?.email || "system";

    // Try to get the profile name for better audit readability
    if (user && !entry.performed_by) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      if (profile?.full_name) {
        performedBy = `${profile.full_name} (${user.email})`;
      }
    }

    await supabase.from("audit_log").insert({
      ...entry,
      performed_by: performedBy,
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
