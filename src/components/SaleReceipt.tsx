import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/stock-helpers";
import { Printer } from "lucide-react";
import { useRef } from "react";

interface SaleReceiptProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: {
    id: string;
    sale_date: string;
    quantity_sold: number;
    selling_price_per_unit: number;
    total_revenue: number;
    total_cogs: number;
    profit: number;
    sale_type: string;
    sale_source: string;
    note?: string | null;
    products?: { name: string; bottle_size: string } | null;
  } | null;
}

export function SaleReceipt({ open, onOpenChange, sale }: SaleReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!sale) return null;

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
          <div className="row"><span>Receipt #:</span><span>{sale.id.slice(0, 8).toUpperCase()}</span></div>
          <div className="row"><span>Source:</span><span style={{ textTransform: "capitalize" }}>{sale.sale_source === "online_shop" ? "Online Shop" : "Shop"}</span></div>
          <div className="row"><span>Payment:</span><span style={{ textTransform: "uppercase" }}>{sale.sale_type}</span></div>
          <hr />
          <div className="row"><span><strong>{sale.products?.name}</strong> ({sale.products?.bottle_size})</span></div>
          <div className="row"><span>{sale.quantity_sold} × {fmt(sale.selling_price_per_unit)}</span><span>{fmt(sale.total_revenue)}</span></div>
          <hr />
          <div className="row total"><span>TOTAL</span><span>{fmt(sale.total_revenue)}</span></div>
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
