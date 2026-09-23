import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/stock-helpers";
import { Printer } from "lucide-react";
import { useRef } from "react";

export interface ReceiptData {
  sale: {
    id: string;
    sale_number: string;
    sale_date: string;
    sale_type: string;
    total: number;
    subtotal: number;
    discount: number;
    status: string;
    note?: string | null;
    branches?: { name: string } | null;
    loyalty_customers?: { full_name: string; phone: string } | null;
    pos_terminals?: { label: string; terminal_id: string | null } | null;
    bank_accounts?: { bank_name: string; account_name: string } | null;
  };
  items: {
    quantity: number;
    unit_price: number;
    line_total: number;
    products?: { name: string; bottle_size: string } | null;
  }[];
  pointsEarned: number;
}

interface SaleReceiptProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ReceiptData | null;
}

export function SaleReceipt({ open, onOpenChange, data }: SaleReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!data) return null;
  const { sale, items, pointsEarned } = data;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
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
          <DialogTitle>Sale Receipt</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <h2>Al-Khair</h2>
          <div className="sub">Fresh Drinks & More</div>
          <hr />
          <div className="row"><span>Date:</span><span>{sale.sale_date}</span></div>
          <div className="row"><span>Receipt #:</span><span>{sale.sale_number}</span></div>
          <div className="row"><span>Branch:</span><span>{sale.branches?.name || "—"}</span></div>
          <div className="row"><span>Payment:</span><span style={{ textTransform: "uppercase" }}>{sale.sale_type}</span></div>
          {sale.sale_type === "pos" && sale.pos_terminals && (
            <div className="row"><span>POS:</span><span>{sale.pos_terminals.label}{sale.pos_terminals.terminal_id ? ` (${sale.pos_terminals.terminal_id})` : ""}</span></div>
          )}
          {sale.sale_type === "transfer" && sale.bank_accounts && (
            <div className="row"><span>Bank:</span><span>{sale.bank_accounts.bank_name} — {sale.bank_accounts.account_name}</span></div>
          )}
          {sale.loyalty_customers && (
            <div className="row"><span>Customer:</span><span>{sale.loyalty_customers.full_name}</span></div>
          )}
          <hr />
          {items.map((i, idx) => (
            <div key={idx}>
              <div className="row"><span><strong>{i.products?.name}</strong> ({i.products?.bottle_size})</span></div>
              <div className="row"><span>{i.quantity} × {fmt(i.unit_price)}</span><span>{fmt(i.line_total)}</span></div>
            </div>
          ))}
          <hr />
          {sale.discount > 0 && (
            <>
              <div className="row"><span>Subtotal:</span><span>{fmt(sale.subtotal)}</span></div>
              <div className="row"><span>Discount (redeemed):</span><span>-{fmt(sale.discount)}</span></div>
            </>
          )}
          <div className="row total"><span>PAYABLE</span><span>{fmt(sale.total)}</span></div>
          {pointsEarned > 0 && <div className="row"><span>Points earned:</span><span>+{pointsEarned}</span></div>}
          {sale.note && <div style={{ marginTop: 8, color: "#666", fontSize: 11 }}>Note: {sale.note}</div>}
          <div className="footer">Thank you for your purchase!</div>
        </div>

        <Button onClick={handlePrint} className="w-full mt-2">
          <Printer className="mr-2 h-4 w-4" /> Print / Share
        </Button>
      </DialogContent>
    </Dialog>
  );
}
