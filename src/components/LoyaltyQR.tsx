import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { useRef } from "react";

interface LoyaltyQRProps {
  token: string;
  customerName?: string;
  phone?: string;
  size?: number;
  showActions?: boolean;
}

export function LoyaltyQR({ token, customerName, phone, size = 180, showActions = true }: LoyaltyQRProps) {
  const svgRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const el = svgRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Loyalty Card - ${customerName || token}</title>
      <style>
        body { font-family: sans-serif; text-align:center; padding:24px; }
        h2 { margin: 0 0 4px; }
        .sub { color:#666; font-size:12px; margin-bottom:16px; }
        .token { font-family: monospace; font-weight:700; letter-spacing:0.12em; margin-top:12px; }
        @media print { body { padding:0; } }
      </style></head><body>
      <h2>AL-KHAIR LOYALTY</h2>
      <div class="sub">${customerName || ""}${phone ? ` · ${phone}` : ""}</div>
      ${el.innerHTML}
      <div class="token">${token}</div>
      <script>window.print(); window.close();</script>
      </body></html>
    `);
    win.document.close();
  };

  const handleDownload = () => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alkhair-loyalty-${token}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={svgRef} className="rounded-xl border border-border bg-white p-3 shadow-sm">
        <QRCodeSVG value={token} size={size} level="M" includeMargin />
      </div>
      <p className="font-mono text-xs font-semibold tracking-widest">{token}</p>
      {customerName && <p className="text-xs text-muted-foreground">{customerName}{phone ? ` · ${phone}` : ""}</p>}
      {showActions && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="mr-1 h-3.5 w-3.5" />Print</Button>
          <Button variant="outline" size="sm" onClick={handleDownload}><Download className="mr-1 h-3.5 w-3.5" />SVG</Button>
        </div>
      )}
    </div>
  );
}
