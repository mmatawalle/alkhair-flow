import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PartyPopper, Lock } from "lucide-react";
import type { SpinResult } from "@/lib/spin";
import { registerAndClaimWin, winHeaderText } from "@/lib/spin";
import { LoyaltyQR } from "@/components/LoyaltyQR";

interface SpinRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  win: SpinResult | null;
  demo: boolean;
  onClaimed: (info: { customerToken: string; customerName: string; voucher_code: string | null }) => void;
}

function friendlyError(message: string): string {
  if (/duplicate key|already exists|23505/i.test(message)) {
    return "This phone number is already registered — good news, your win is safe! Give your phone number at the till to claim it.";
  }
  if (/already claimed/i.test(message)) return "This reward was already claimed on your account. Show your QR at the till — staff can help.";
  if (/expired/i.test(message)) return "This win has expired. Spin again or join loyalty for 5% off every day.";
  return message || "Registration failed. Your win is saved — please try again or ask the cashier for help.";
}

export function SpinRegisterDialog({ open, onOpenChange, win, demo, onClaimed }: SpinRegisterDialogProps) {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", marketing_consent: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; voucher: string | null } | null>(null);

  // Header MUST display the win so the user doesn't feel like losing the points.
  const header = win
    ? winHeaderText({ prize_label: win.prize_label, prize_type: win.prize_type, points_amount: win.points_amount })
    : "Claim your win";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!win) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError("Name and phone number are required to keep your win.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await registerAndClaimWin({
        full_name: form.full_name,
        phone: form.phone,
        email: form.email || null,
        marketing_consent: form.marketing_consent,
        claim_token: win.claim_token,
        demo,
      });
      setDone({ token: res.customerToken, voucher: res.voucher_code });
      onClaimed({ customerToken: res.customerToken, customerName: form.full_name.trim(), voucher_code: res.voucher_code });
    } catch (err) {
      setError(friendlyError((err as { message?: string })?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <PartyPopper className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">{done ? "Win secured! 🎉" : header}</DialogTitle>
          <DialogDescription className="text-center">
            {done ? (
              <>Your win is on your account — screenshot this card.</>
            ) : (
              <>
                Your <strong className="text-foreground">{win?.prize_label}</strong> is saved and locked to this device.
                Register in ~20 seconds to keep it — no loss, no re-spin.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <LoyaltyQR token={done.token} customerName={form.full_name.trim()} size={160} showActions={false} />
            </div>
            {done.voucher && (
              <p className="rounded-lg border bg-muted/50 p-3 text-center text-sm">
                Till voucher: <span className="font-mono font-bold tracking-widest">{done.voucher}</span>
                <span className="block text-xs text-muted-foreground">Show this + your QR at the till.</span>
              </p>
            )}
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Members save 5% on every purchase + earn points.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center text-sm font-medium">
              🔒 Claiming: {win?.prize_label}
              {win?.prize_type === "points" ? ` (${win.points_amount} pts)` : ""}
            </div>
            <Input
              placeholder="Full name *"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              className="h-11"
              autoComplete="name"
            />
            <Input
              placeholder="Phone number *"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
              className="h-11"
              inputMode="tel"
              autoComplete="tel"
            />
            <Input
              type="email"
              placeholder="Email (optional — for receipts)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-11"
              autoComplete="email"
            />
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.marketing_consent}
                onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })}
              />
              <span>Yes, Al-Khair may send me offers.</span>
            </label>
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Securing your win..." : `Register & Keep My ${win?.prize_label || "Win"}`}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Already a member? Just give your phone number at the till — no need to register again.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
