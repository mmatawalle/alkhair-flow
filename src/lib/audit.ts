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
    await supabase.from("audit_log").insert({
      ...entry,
      performed_by: entry.performed_by || user?.email || "system",
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
