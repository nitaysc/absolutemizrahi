import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import mizrahi from "@/assets/absolute-mizrahi.gif";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { supabase } from "@/integrations/supabase/client";

export default function AuthPage() {
  const { user, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "signup"
        ? await signUp(email, password)
        : await signIn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(mode === "signup" ? "Account created — 1,000 coins added!" : "Welcome back");
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Check your email for the reset link");
      setForgotOpen(false);
      setForgotEmail("");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="fixed inset-0 -z-10 opacity-[0.08]"
        style={{ backgroundImage: `url(${mizrahi})`, backgroundRepeat: "repeat", backgroundSize: "180px" }}
      />
      <div className="w-full max-w-md rounded-3xl border border-border bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={mizrahi} alt="Mizrahi" className="mb-3 h-20 w-20 rounded-2xl ring-2 ring-primary/50" />
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-gradient">MIZRAHI</span> CASINO
          </h1>
          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            Get <span className="font-semibold text-foreground">1,000</span>
            <MizrahiCoin size={16} /> on signup
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full font-bold">
            {busy ? "..." : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>

        {mode === "signin" && !forgotOpen && (
          <button
            onClick={() => {
              setForgotEmail(email);
              setForgotOpen(true);
            }}
            className="mt-2 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Forgot password?
          </button>
        )}

        {forgotOpen && (
          <form onSubmit={onForgot} className="mt-5 space-y-3 rounded-2xl border border-border bg-background/50 p-4">
            <div>
              <Label htmlFor="forgot-email" className="text-xs uppercase tracking-widest">
                Reset password
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                We'll email you a link to set a new password.
              </p>
              <Input
                id="forgot-email"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="mt-2"
                placeholder="you@example.com"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={forgotBusy} className="flex-1 font-bold">
                {forgotBusy ? "Sending..." : "Send reset link"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setForgotOpen(false)}
                disabled={forgotBusy}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}