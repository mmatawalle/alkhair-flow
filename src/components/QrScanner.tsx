import { useEffect, useId, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface QrScannerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onScanned: (text: string) => void;
}

export function QrScanner({ open, onOpenChange, onScanned }: QrScannerProps) {
  const id = useId().replace(/:/g, "-");
  const readerId = `qr-reader-${id}`;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let html5QrCode: any = null;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const start = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        html5QrCode = new Html5Qrcode(readerId);
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            if (!cancelled) {
              try {
                html5QrCode?.stop().catch(() => {});
                html5QrCode?.clear().catch(() => {});
              } catch {}
              onScanned(decodedText.trim());
              onOpenChange(false);
            }
          },
          () => {}
        );
        if (!cancelled) setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Camera failed to start. Check permissions.");
          setStarting(false);
        }
      }
    };

    // small delay to ensure DOM is mounted
    const t = setTimeout(start, 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (html5QrCode) {
        html5QrCode
          .stop()
          .then(() => html5QrCode.clear())
          .catch(() => {});
      }
    };
  }, [open, readerId, onScanned, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center justify-between">
            <span>Scan loyalty QR</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-left">Point camera at the customer's QR code. It will auto-attach on detection.</p>
        </DialogHeader>
        <div className="px-4 pb-4 space-y-3">
          <div
            id={readerId}
            className="w-full rounded-lg overflow-hidden border bg-black [&_video]:w-full [&_video]:rounded-lg"
            style={{ minHeight: 280 }}
          />
          {starting && <p className="text-xs text-muted-foreground text-center">Starting camera… allow permission if prompted.</p>}
          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          <p className="text-[11px] text-muted-foreground text-center">Tip: ensure good lighting and hold steady 15–25cm away.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
