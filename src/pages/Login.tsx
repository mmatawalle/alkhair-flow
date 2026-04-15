import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const logoSrc = `${import.meta.env.BASE_URL}brand-logo.png`;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (error: unknown) {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Check your email", description: "A password reset link has been sent." });
      setShowForgot(false);
    } catch (error: unknown) {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center space-y-3 pb-2">
            <img
              src={logoSrc}
              alt="AL-KHAIR DRINKS & SNACKS"
              className="mx-auto h-16 w-16 rounded-lg border border-border bg-card object-cover"
            />
            <CardTitle className="text-lg font-semibold">Reset Password</CardTitle>
            <CardDescription>Enter your email to receive a reset link</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Input type="email" placeholder="Email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required className="h-11" />
              <Button type="submit" className="w-full h-11" disabled={forgotLoading}>
                {forgotLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
            <Button variant="link" className="mt-4 w-full text-muted-foreground text-sm" onClick={() => setShowForgot(false)}>
              Back to Sign In
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
            className="mx-auto h-20 w-20 rounded-lg border border-border bg-card object-cover"
          />
          <CardTitle className="text-lg font-semibold">AL-KHAIR DRINKS & SNACKS</CardTitle>
          <CardDescription>Sign in to manage operations</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-11" />
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Please wait..." : "Sign In"}
            </Button>
          </form>
          <Button variant="link" className="mt-4 w-full text-muted-foreground text-sm" onClick={() => setShowForgot(true)}>
            Forgot password?
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
