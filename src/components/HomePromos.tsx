// @ts-nocheck -- references tables not yet in generated DB types
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SpinWheel } from "@/components/SpinWheel";
import { fetchActiveWheel, publicGameUrl } from "@/lib/spin";
import { BadgePercent, Copy, ExternalLink, Gift, Play, Sparkles, UserPlus, Users } from "lucide-react";

function copyLink(url: string, toast: (t: any) => void, label: string) {
  navigator.clipboard?.writeText(url).then(
    () => toast({ title: `${label} copied`, description: url }),
    () => toast({ title: label, description: url }),
  );
}

/** Home-page promo: the Spin & Win game, with live wheel preview + customer link. */
export function SpinPromoCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["spin_wheel_home"],
    queryFn: () => fetchActiveWheel(),
    staleTime: 60_000,
  });
  const { data: todaySpins } = useQuery({
    queryKey: ["spin_plays_today"],
    queryFn: async () => {
      const sb = supabase as any;
      const start = new Date().toISOString().split("T")[0];
      const { data, error } = await sb.from("spin_plays").select("id, status").gte("created_at", start);
      if (error) return { spins: 0, claimed: 0 };
      const rows = (data as any[]) || [];
      return { spins: rows.length, claimed: rows.filter((r) => r.status === "claimed").length };
    },
    staleTime: 30_000,
  });

  const prizes = data?.prizes || [];
  const url = publicGameUrl("spin");

  return (
    <Card className="overflow-hidden border-primary/30 bg-card/95">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />Customer game · live</Badge>
          {todaySpins && todaySpins.spins > 0 && (
            <span className="text-xs text-muted-foreground">{todaySpins.spins} spins today · {todaySpins.claimed} claimed</span>
          )}
        </div>
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          <div className="w-full max-w-[220px] shrink-0">
            {prizes.length > 0 && <SpinWheel prizes={prizes} targetPrizeId={null} spinning={false} onSettled={undefined} />}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h3 className="text-lg font-bold">Spin & Win — right on the home page</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Customers spin free for points, treats & discounts — then register to redeem.
              Show this on the till tablet or share the link.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={() => navigate("/spin")} className="flex-1 sm:flex-none">
                <Play className="mr-2 h-4 w-4" />Play the game
              </Button>
              <Button variant="outline" onClick={() => copyLink(url, toast, "Spin link")} className="flex-1 sm:flex-none">
                <Copy className="mr-2 h-4 w-4" />Copy spin link
              </Button>
            </div>
            <button
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => navigate("/loyalty/spin")}
            >
              Edit prizes, odds & budgets <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Home-page banner: Join Al-Khair Loyalty, prominent. */
export function LoyaltyJoinCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: memberCount } = useQuery({
    queryKey: ["loyalty_member_count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("loyalty_customers").select("id", { count: "exact", head: true });
      if (error) return null;
      return count;
    },
    staleTime: 60_000,
  });

  const url = publicGameUrl("join");

  return (
    <Card className="overflow-hidden border-primary/40 bg-primary/10">
      <CardContent className="p-4 md:p-5">
        <Badge className="bg-primary text-primary-foreground"><Users className="mr-1 h-3 w-3" />Al-Khair Loyalty</Badge>
        <h3 className="mt-3 text-xl font-bold sm:text-2xl">Join Al-Khair Loyalty — save 5% on everything</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {memberCount != null && memberCount > 0 ? (
            <><strong className="text-foreground">{memberCount.toLocaleString()} members</strong> already earn points on every purchase. </>
          ) : (
            <>Members earn points on every purchase. </>
          )}
          One registration, instant QR card, birthday treats.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><BadgePercent className="h-4 w-4 shrink-0 text-primary" />5% member discount, automatically at the till</li>
          <li className="flex items-center gap-2"><Gift className="h-4 w-4 shrink-0 text-primary" />Points → free treats, discounts & rewards</li>
          <li className="flex items-center gap-2"><UserPlus className="h-4 w-4 shrink-0 text-primary" />20-second signup — name + phone only</li>
        </ul>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => copyLink(url, toast, "Join link")} className="flex-1">
            <Copy className="mr-2 h-4 w-4" />Copy join link
          </Button>
          <Button variant="outline" onClick={() => navigate("/loyalty/customers")} className="flex-1 bg-card/80">
            <UserPlus className="mr-2 h-4 w-4" />Register a customer
          </Button>
        </div>
        <button
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => navigate("/join")}
        >
          Open the join page <ExternalLink className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  );
}
