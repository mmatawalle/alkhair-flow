import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SortableTableHead } from "@/components/SortableTableHead";
import { useSortableTable } from "@/hooks/use-sortable-table";

const MODULES = ["all", "sales", "purchases", "production", "transfers", "expenses", "gifts", "internal", "stock_adjustment", "products", "raw_materials", "vendors"];
const ACTION_TYPES = ["all", "create", "edit", "delete", "void", "settle", "stock_adjustment"];

export default function AuditLog() {
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit_log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  const users = useMemo(() => {
    const set = new Set<string>();
    logs?.forEach(l => { if (l.performed_by) set.add(l.performed_by); });
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let result = logs ?? [];
    if (moduleFilter !== "all") result = result.filter(l => l.module === moduleFilter);
    if (actionFilter !== "all") result = result.filter(l => l.action_type?.toLowerCase().includes(actionFilter));
    if (userFilter !== "all") result = result.filter(l => l.performed_by === userFilter);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        l.action_type?.toLowerCase().includes(s) ||
        l.performed_by?.toLowerCase().includes(s) ||
        l.note?.toLowerCase().includes(s)
      );
    }
    if (dateFrom) result = result.filter(l => l.created_at >= dateFrom);
    if (dateTo) result = result.filter(l => l.created_at.slice(0, 10) <= dateTo);
    return result;
  }, [logs, moduleFilter, actionFilter, userFilter, search, dateFrom, dateTo]);

  const { sort, toggleSort, sorted } = useSortableTable(filtered, { key: "created_at", direction: "desc" });

  const actionColor = (type: string) => {
    if (type.includes("create") || type.includes("add")) return "default";
    if (type.includes("void") || type.includes("delete")) return "destructive";
    if (type.includes("edit") || type.includes("update")) return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Module</label>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODULES.map(m => <SelectItem key={m} value={m} className="capitalize">{m.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[130px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map(a => <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">User</label>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Search</label>
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px] h-8 text-sm" />
        </div>
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(""); setDateTo(""); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Date/Time" sortKey="created_at" sort={sort} onToggle={toggleSort} />
                  <SortableTableHead label="Action" sortKey="action_type" sort={sort} onToggle={toggleSort} />
                  <SortableTableHead label="Module" sortKey="module" sort={sort} onToggle={toggleSort} />
                  <TableHead>By</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No audit records</TableCell></TableRow>
                ) : sorted.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={actionColor(log.action_type)} className="text-xs">{log.action_type}</Badge></TableCell>
                    <TableCell className="capitalize text-sm">{log.module}</TableCell>
                    <TableCell className="text-sm">{log.performed_by || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {log.new_values ? JSON.stringify(log.new_values).slice(0, 80) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{log.note || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
