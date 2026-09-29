// @ts-nocheck -- references tables not yet in generated DB types
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LoyaltyQR } from "@/components/LoyaltyQR";
import { BadgePercent, CheckCircle2 } from "lucide-react";

const logoSrc = `${import.meta.env.BASE_URL}brand-logo.png`;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Map RPC/DB errors to customer-friendly text (never leak internals). */
function friendlyError(message: string): string {
  if (/duplicate key|already exists|23505/i.test(message)) {
    return "This phone number is already registered. Just give your phone number at the till — no need to register again.";
  }
  if (/full name|phone number/i.test(message)) return message;
  return "Registration failed. Please check your details and try again, or ask the cashier for help.";
}

export default function Join() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    birthday: "",
    area: "",
    age_range: "",
    gender: "",
    marketing_consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; token: string; handle: string | null } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast({ title: "Name and phone number are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("register_loyalty_member", {
        p_full_name: form.full_name.trim(),
        p_phone: form.phone.trim(),
        p_email: form.email.trim() || null,
        p_birthday: form.birthday || null,
        p_area: form.area.trim() || null,
        p_age_range: form.age_range || null,
        p_gender: form.gender || null,
        p_marketing_consent: form.marketing_consent,
      });
      if (error) throw error;
      const row = (data as unknown as { customer_id: string; token: string; handle: string | null }[] | null)?.[0];
      if (!row?.token) throw new Error("Registration failed");
      setDone({ name: form.full_name.trim(), token: row.token, handle: row.handle || null });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : getErrorMessage(err);
      // Supabase RPC errors come wrapped as { message, ... }; surface the DB message when present.
      const msg = (err as { message?: string })?.message || raw;
      toast({ title: "Could not register", description: friendlyError(msg), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-2">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <CardTitle className="text-lg">You’re in, {done.name}! 🎉</CardTitle>
            <CardDescription>
              Show this QR — or your phone number — at the till to earn points on every purchase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <LoyaltyQR token={done.token} customerName={done.name} size={180} />
            </div>
            {done.handle && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-center text-sm">
                Member ID: <span className="font-mono font-bold tracking-wide">{done.handle}</span>
                <span className="block text-xs font-normal text-muted-foreground">Easy to remember — quote it at the till instead of your phone number.</span>
              </p>
            )}
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
              <BadgePercent className="h-4 w-4 text-emerald-600" />
              Members save 5% on every purchase.
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Screenshot this card so you always have it. Lost it? Any branch can reissue — your points stay on your account.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setDone(null); setForm({ full_name: "", phone: "", email: "", birthday: "", area: "", age_range: "", gender: "", marketing_consent: false }); }}>
              Register another member
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3 pb-2">
          <img
            src={logoSrc}
            alt="AL-KHAIR DRINKS & SNACKS"
            className="mx-auto h-16 w-16 rounded-lg border border-border bg-card object-cover"
          />
          <CardTitle className="text-lg font-semibold">Join AL-KHAIR Loyalty</CardTitle>
          <CardDescription>
            One registration, instant QR card. <span className="font-medium text-foreground">Members save 5% on every purchase</span> and earn points toward rewards.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={submit} className="space-y-3">
            <Input placeholder="Full name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="h-11" autoComplete="name" />
            <Input placeholder="Phone number *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required className="h-11" inputMode="tel" autoComplete="tel" />
            <Input type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" autoComplete="email" />
            <div>
              <label className="text-xs text-muted-foreground">Birthday (optional — for a birthday treat)</label>
              <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Area (optional)" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="h-11" />
              <Select value={form.age_range || "__none"} onValueChange={(v) => setForm({ ...form, age_range: v === "__none" ? "" : v })}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Age" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Age: skip</SelectItem>
                  <SelectItem value="Under 18">Under 18</SelectItem>
                  <SelectItem value="18-24">18–24</SelectItem>
                  <SelectItem value="25-34">25–34</SelectItem>
                  <SelectItem value="35-44">35–44</SelectItem>
                  <SelectItem value="45-54">45–54</SelectItem>
                  <SelectItem value="55+">55+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={form.gender || "__none"} onValueChange={(v) => setForm({ ...form, gender: v === "__none" ? "" : v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Gender (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Gender: skip</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="mt-0.5" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />
              <span>Yes, Al-Khair may send me offers and use my area/age for purchase insights.</span>
            </label>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Joining..." : "Join & Get My Card"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Feeling lucky? <Link to="/spin" className="font-medium text-foreground underline">Spin the wheel free — win points & discounts</Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Staff? <Link to="/login" className="underline">Sign in here</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
