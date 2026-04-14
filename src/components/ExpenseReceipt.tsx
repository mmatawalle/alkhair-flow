import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/stock-helpers";
import { Printer } from "lucide-react";
import { useRef } from "react";

interface ExpenseReceiptProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: {
    id: string;
    expense_date: string;
    amount: number;
    category_code: string;
    expense_side: string;
    description: string | null;
    requested_by: string | null;
    payment_nature: string;
    payment_source?: string | null;
    linked_item: string | null;
  } | null;
}

export function ExpenseReceipt({ open, onOpenChange, expense: e }: ExpenseReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!e) return null;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Expense Voucher</title>
      <style>
        body { font-family: monospace; padding: 20px; max-width: 350px; margin: 0 auto; font-size: 13px; }
        h2 { text-align: center; margin: 0 0 4px; }
        .sub { text-align: center; color: #666; margin-bottom: 16px; font-size: 11px; }
        hr { border: none; border-top: 1px dashed #ccc; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .row.total { font-weight: bold; font-size: 15px; margin-top: 8px; }
        .footer { text-align: center; margin-top: 20px; color: #999; font-size: 10px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      ${content.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Expense Voucher</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <h2>Al-Khair Drinks & Snacks</h2>
          <div className="sub">Expense Voucher</div>
          <hr />
          <div className="row"><span>Voucher ID:</span><span><strong>{e.id.slice(0, 8).toUpperCase()}</strong></span></div>
          <div className="row"><span>Date:</span><span>{e.expense_date}</span></div>
          <div className="row"><span>Side:</span><span style={{ textTransform: "capitalize" }}>{e.expense_side}</span></div>
          <hr />
          <div className="row"><span>Category:</span><span style={{ textTransform: "capitalize" }}>{e.category_code}</span></div>
          {e.description && <div className="row"><span>Purpose:</span><span>{e.description}</span></div>}
          {e.requested_by && <div className="row"><span>Requested By:</span><span>{e.requested_by}</span></div>}
          <hr />
          <div className="row"><span>Payment Type:</span><span style={{ textTransform: "capitalize" }}>{e.payment_nature.replace(/_/g, " ")}</span></div>
          <div className="row"><span>Payment Source:</span><span style={{ textTransform: "capitalize" }}>{(e as any).payment_source || "cash"}</span></div>
          <hr />
          <div className="row total"><span>AMOUNT</span><span>{fmt(e.amount)}</span></div>
          {e.linked_item && <div style={{ marginTop: 8, color: "#666", fontSize: 11 }}>Linked: {e.linked_item}</div>}
          <div className="footer">Al-Khair Drinks & Snacks — Expense Record</div>
        </div>

        <Button onClick={handlePrint} className="w-full mt-2">
          <Printer className="mr-2 h-4 w-4" /> Print / Share
        </Button>
      </DialogContent>
    </Dialog>
  );
}
