import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
}

export function DateRangeFilter({ from, to, onFromChange, onToChange, onClear }: Props) {
  const hasFilter = from || to;
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <label className="text-xs text-muted-foreground">From</label>
        <Input type="date" value={from} onChange={e => onFromChange(e.target.value)} className="w-auto h-8 text-sm" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">To</label>
        <Input type="date" value={to} onChange={e => onToChange(e.target.value)} className="w-auto h-8 text-sm" />
      </div>
      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X className="h-3 w-3 mr-1" />Clear
        </Button>
      )}
    </div>
  );
}
