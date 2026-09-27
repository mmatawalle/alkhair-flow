import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SpinWheel } from "@/components/SpinWheel";
import { SpinRegisterDialog } from "@/components/SpinRegisterDialog";
import { LoyaltyQR } from "@/components/LoyaltyQR";
import {
  clearPendingWin,
  fetchActiveWheel,
  getGuestKey,
  loadPendingWin,
  oddsPercent,
  playSpin,
  prizeShortText,
  savePendingWin,
  type SpinPrize,
  type SpinResult,
  type SpinWheel as Wheel,
} from "@/lib/spin";
import { Gift, RotateCw, Sparkles, Ticket } from "lucide-react";

const logoSrc = `${import.meta.env.BASE_URL}brand-logo.png`;

export default function Spin() {
  const { toast } = useToast();
  const [wheel, setWheel] = useState<Wheel | null>(null);
  const [prizes, setPrizes] = useState<SpinPrize[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [win, setWin] = useState<SpinResult | null>(() => loadPendingWin());
  const [revealed, setRevealed] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [claimed, setClaimed] = useState<{ token: string; name: string; voucher: string | null } | null>(null);

  useEffect(() => {
    fetchActiveWheel()
      .then(({ wheel, prizes, demo }) => {
        setWheel(wheel);
        setPrizes(prizes);
        setIsDemo(demo);
        // Restore a saved pending win across reloads so the user never feels the loss.
        const pending = loadPendingWin();
        if (pending) {
          setWin(pending);
          setTargetId(pending.prize_id);
          setRevealed(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const totalWeight = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);

  const spin = useCallback(async () => {
    if (!wheel || spinning) return;
    // One free try per guest = the nudge. A saved pending win means the try is used.
    if (win) {
      setShowRegister(true);
      return;
    }
    setSpinning(true);
    setRevealed(false);
    try {
      const guest = getGuestKey();
      const { result, demo } = await playSpin(wheel.id, guest, isDemo);
      setIsDemo((prev) => prev || demo);
      setWin(result);
      savePendingWin(result);
      // Small delay so the wheel visibly starts before targeting the segment.
      setTimeout(() => setTargetId(result.prize_id), 60);
    } catch (e) {
      setSpinning(false);
      const msg = (e as Error).message;
      if (/free spin/i.test(msg)) {
        // Guest already spun on this device — surface the saved win or nudge to register.
        const pending = loadPendingWin();
        if (pending) {
          setWin(pending);
          setTargetId(pending.prize_id);
          setRevealed(true);
          setShowRegister(true);
        } else {
          toast({ title: "Free spin used", description: msg });
        }
      } else {
        toast({ title: "Spin failed", description: msg, variant: "destructive" });
      }
    }
  }, [wheel, spinning, win, isDemo, toast]);

  const onSettled = useCallback(() => {
    setSpinning(false);
    setRevealed(true);
    if (win && win.prize_type !== "no_win") {
      // Nudge: auto-open the registration modal so the win is one tap from safe.
      setTimeout(() => setShowRegister(true), 650);
    }
  }, [win]);

  const wonPrize: SpinPrize | undefined = win ? prizes.find((p) => p.id === win.prize_id) : undefined;
  const isNoWin = win?.prize_type === "no_win";

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <img src={logoSrc} alt="AL-KHAIR" className="h-10 w-10 rounded-lg border border-border bg-card object-cover" />
        <Link to="/join" className="text-xs text-muted-foreground underline">
          Join loyalty →
        </Link>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pb-16">
        <div className="text-center">
          <Badge variant="secondary" className="mb-2">
            <Sparkles className="mr-1 h-3 w-3" /> Spin & Win
          </Badge>
          <h1 className="text-2xl font-bold">{wheel?.name || "Lucky Spin"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading prizes..." : (wheel?.description || "Try free — win points, treats or discounts.")}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            🎁 1 free try — no registration needed to spin. Register only to keep your win.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Loading wheel...</p>
            ) : (
              <>
                <SpinWheel prizes={prizes} targetPrizeId={targetId} spinning={spinning} onSettled={onSettled} />
                <div className="mt-4 text-center">
                  {!win && !spinning && (
                    <Button size="lg" className="h-12 w-full text-base" onClick={spin}>
                      <RotateCw className="mr-2 h-5 w-5" /> Tap to Spin — it's free
                    </Button>
                  )}
                  {spinning && !revealed && (
                    <p className="py-2 text-sm font-medium text-muted-foreground">Spinning... good luck! 🍀</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Result → redeem nudge (registration stays a modal so the win feels safe) */}
        {win && revealed && !claimed && (
          <Card className={isNoWin ? "" : "border-primary/40 bg-primary/5"}>
            <CardHeader className="pb-2 text-center">
              <CardTitle className="text-lg">
                {isNoWin ? "So close! 🍀" : `You won ${win.prize_label}! 🎉`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                {isNoWin ? (
                  <>No prize this time — but members save <strong className="text-foreground">5% on every purchase</strong>.</>
                ) : (
                  <>
                    Your <strong className="text-foreground">{prizeShortText({ label: win.prize_label, prize_type: win.prize_type, points_amount: win.points_amount, discount_percent: win.discount_percent, value_amount: win.value_amount })}</strong> is
                    saved on this device until {new Date(win.expires_at).toLocaleDateString()}.
                    {win.voucher_code && (
                      <> Till code: <span className="font-mono font-bold">{win.voucher_code}</span></>
                    )}
                  </>
                )}
              </p>
              {isNoWin ? (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setShowRegister(true)}>Join loyalty — 5% off</Button>
                  <Button variant="outline" className="flex-1" onClick={() => { clearPendingWin(); setWin(null); setTargetId(null); setRevealed(false); }}>
                    Dismiss
                  </Button>
                </div>
              ) : (
                <>
                  <Button size="lg" className="h-12 w-full text-base" onClick={() => setShowRegister(true)}>
                    <Gift className="mr-2 h-5 w-5" /> Redeem — Register to keep it
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Takes ~20 seconds. Your win stays saved even if you close this page.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {claimed && (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardHeader className="pb-2 text-center">
              <CardTitle className="text-lg">Win secured, {claimed.name}! 🎉</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-center">
                <LoyaltyQR token={claimed.token} customerName={claimed.name} size={150} showActions={false} />
              </div>
              {claimed.voucher && (
                <p className="rounded-lg border bg-card p-3 text-center text-sm">
                  <Ticket className="mr-1 inline h-4 w-4" /> Till voucher:{" "}
                  <span className="font-mono font-bold tracking-widest">{claimed.voucher}</span>
                </p>
              )}
              <p className="text-center text-xs text-muted-foreground">Show this QR at the till to earn points on every purchase.</p>
            </CardContent>
          </Card>
        )}

        {/* Odds (adjustable by admin) + capped budgets = trust */}
        {prizes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">What can you win?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {prizes.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: p.color }} />
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground">{p.description}</span>
                  </span>
                  <span className="text-muted-foreground">{oddsPercent(p.weight, totalWeight).toFixed(1)}%</span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Odds & budgets are capped by the store — the wheel never promises more than it can deliver.
                {isDemo && " (Preview mode — connect the database for live prizes.)"}
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <SpinRegisterDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        win={win}
        demo={isDemo}
        onClaimed={(info) => {
          setClaimed({ token: info.customerToken, name: info.customerName, voucher: info.voucher_code });
          clearPendingWin();
        }}
      />
    </div>
  );
}
