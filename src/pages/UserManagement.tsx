import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, KeyRound, UserCheck, UserX } from "lucide-react";
import { logAudit } from "@/lib/audit";

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
}

async function callAdmin(action: string, body: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke("admin-manage-users", {
    body: { action, ...body },
  });
  if (res.error) throw new Error(res.error.message);
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export default function UserManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showReset, setShowReset] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "staff" });
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await callAdmin("list_users", {});
      return res.users as ManagedUser[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () => callAdmin("create_user", form),
    onSuccess: () => {
      toast({ title: "User created" });
      logAudit({ action_type: "CREATE", module: "Users", note: `Created user ${form.email}` });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreate(false);
      setForm({ full_name: "", email: "", password: "", role: "staff" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ user_id, is_active }: { user_id: string; is_active: boolean }) =>
      callAdmin("toggle_active", { user_id, is_active }),
    onSuccess: (_, v) => {
      toast({ title: v.is_active ? "User activated" : "User deactivated" });
      logAudit({ action_type: "UPDATE", module: "Users", note: `${v.is_active ? "Activated" : "Deactivated"} user` });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: ({ user_id, new_password }: { user_id: string; new_password: string }) =>
      callAdmin("reset_password", { user_id, new_password }),
    onSuccess: () => {
      toast({ title: "Password reset" });
      logAudit({ action_type: "UPDATE", module: "Users", note: "Admin reset user password" });
      setShowReset(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: string }) =>
      callAdmin("update_role", { user_id, role }),
    onSuccess: () => {
      toast({ title: "Role updated" });
      logAudit({ action_type: "UPDATE", module: "Users", note: "Updated user role" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />Add User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No users</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select
                      value={u.roles[0] || "staff"}
                      onValueChange={(role) => roleMutation.mutate({ user_id: u.id, role })}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "destructive"}>
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setShowReset(u)}>
                      <KeyRound className="h-3 w-3 mr-1" />Reset
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_active ? "destructive" : "default"}
                      onClick={() => toggleMutation.mutate({ user_id: u.id, is_active: !u.is_active })}
                    >
                      {u.is_active ? <><UserX className="h-3 w-3 mr-1" />Deactivate</> : <><UserCheck className="h-3 w-3 mr-1" />Activate</>}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input type="password" placeholder="Temporary Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} />
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.email || !form.password || !form.full_name}>
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showReset} onOpenChange={() => { setShowReset(null); setNewPassword(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password for {showReset?.full_name || showReset?.email}</DialogTitle></DialogHeader>
          <Input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReset(null); setNewPassword(""); }}>Cancel</Button>
            <Button onClick={() => showReset && resetMutation.mutate({ user_id: showReset.id, new_password: newPassword })} disabled={resetMutation.isPending || newPassword.length < 6}>
              {resetMutation.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
