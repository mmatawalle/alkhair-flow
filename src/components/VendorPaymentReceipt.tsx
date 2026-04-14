import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { fmt } from "@/lib/stock-helpers";

interface VendorPaymentReceiptProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: {
    id: string;
    payment_date: string;
    amount: number;
    note?: string | null;
    vendors?: { name: string } | null;
  } | null;
}

export function VendorPaymentReceipt({ open, onOpenChange, payment: p }: VendorPaymentReceiptProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  if (!p) return null;

  const handlePrint = () => {
    const content = contentRef.current;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Vendor Payment</title><style>body{font-family:sans-serif;padding:24px;max-width:400px;margin:auto}h2{text-align:center;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px 4px;border-bottom:1px solid #eee}td:first-child{color:#666;width:40%}</style></head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
    w.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Vendor Payment Receipt</DialogTitle></DialogHeader>
        <div ref={contentRef}>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>Al-Khair Drinks & Snacks</h2>
          <p style={{ textAlign: "center", fontSize: 12, color: "#888" }}>Vendor Payment Voucher</p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <tbody>
              <tr><td style={{ color: "#666", padding: "6px 4px", borderBottom: "1px solid #eee" }}>Voucher #</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #eee" }}>{p.id.slice(0, 8).toUpperCase()}</td></tr>
              <tr><td style={{ color: "#666", padding: "6px 4px", borderBottom: "1px solid #eee" }}>Date</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #eee" }}>{p.payment_date}</td></tr>
              <tr><td style={{ color: "#666", padding: "6px 4px", borderBottom: "1px solid #eee" }}>Vendor</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #eee", fontWeight: 600 }}>{p.vendors?.name || "—"}</td></tr>
              <tr><td style={{ color: "#666", padding: "6px 4px", borderBottom: "1px solid #eee" }}>Amount Paid</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #eee", fontWeight: 700 }}>{fmt(p.amount)}</td></tr>
              {p.note && <tr><td style={{ color: "#666", padding: "6px 4px", borderBottom: "1px solid #eee" }}>Note</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #eee" }}>{p.note}</td></tr>}
            </tbody>
          </table>
        </div>
        <Button variant="outline" className="mt-2" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />Print / Share
        </Button>
      </DialogContent>
    </Dialog>
  );
}
