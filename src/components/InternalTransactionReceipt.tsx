import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/stock-helpers";
import { Printer } from "lucide-react";
import { useRef } from "react";

interface InternalTransactionReceiptProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: {
    id: string;
    transaction_date: string;
    transaction_type: string;
    taken_by: string | null;
    given_by: string | null;
    quantity: number | null;
    amount: number | null;
    status: string;
    settlement_method: string | null;
    amount_settled: number | null;
    date_settled: string | null;
    received_by: string | null;
    note: string | null;
    products?: { name: string; bottle_size: string; selling_price: number } | null;
  } | null;
}

export function InternalTransactionReceipt({ open, onOpenChange, transaction: t }: InternalTransactionReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!t) return null;

  const value = t.transaction_type === "cash"
    ? Number(t.amount)
    : Number(t.quantity) * Number(t.products?.selling_price || 0);

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
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .pending { background: #fef3c7; color: #92400e; }
        .settled { background: #d1fae5; color: #065f46; }
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
          <DialogTitle>Transaction Receipt</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <h2>Al-Khair Drinks & Snacks</h2>
          <div className="sub">Internal Transaction Receipt</div>
          <hr />
          <div className="row"><span>Receipt ID:</span><span><strong>{t.id.slice(0, 8).toUpperCase()}</strong></span></div>
          <div className="row"><span>Date:</span><span>{t.transaction_date}</span></div>
          <div className="row"><span>Type:</span><span style={{ textTransform: "capitalize" }}>{t.transaction_type}</span></div>
          <hr />
          {t.taken_by && <div className="row"><span>Taken By:</span><span>{t.taken_by}</span></div>}
          {t.given_by && <div className="row"><span>Given By:</span><span>{t.given_by}</span></div>}
          <hr />
          {t.transaction_type === "product" && t.products && (
            <>
              <div className="row"><span>Product:</span><span>{t.products.name} ({t.products.bottle_size})</span></div>
              <div className="row"><span>Quantity:</span><span>{t.quantity}</span></div>
            </>
          )}
          {t.transaction_type === "cash" && (
            <div className="row"><span>Cash Amount:</span><span>{fmt(Number(t.amount))}</span></div>
          )}
          <div className="row total"><span>VALUE</span><span>{fmt(value)}</span></div>
          <hr />
          <div className="row">
            <span>Status:</span>
            <span className={`badge ${t.status}`} style={{ textTransform: "uppercase" }}>{t.status}</span>
          </div>
          {t.status === "settled" && (
            <>
              {t.settlement_method && <div className="row"><span>Settled Via:</span><span style={{ textTransform: "capitalize" }}>{t.settlement_method}</span></div>}
              {t.amount_settled != null && <div className="row"><span>Amount Settled:</span><span>{fmt(Number(t.amount_settled))}</span></div>}
              {t.date_settled && <div className="row"><span>Date Settled:</span><span>{t.date_settled}</span></div>}
              {t.received_by && <div className="row"><span>Received By:</span><span>{t.received_by}</span></div>}
            </>
          )}
          {t.note && <div style={{ marginTop: 8, color: "#666", fontSize: 11 }}>Note: {t.note}</div>}
          <div className="footer">Al-Khair Drinks & Snacks — Internal Record</div>
        </div>

        <Button onClick={handlePrint} className="w-full mt-2">
          <Printer className="mr-2 h-4 w-4" /> Print / Share
        </Button>
      </DialogContent>
    </Dialog>
  );
}
