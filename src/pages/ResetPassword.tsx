import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import mizrahi from "@/assets/absolute-mizrahi.gif";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // When Supabase processes a recovery link, it fires PASSWORD_RECOVERY
    // and creates a temporary session that allows updateUser({ password }).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated — you're signed in");
    navigate("/", { replace: true });
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
          <h1 className="text-2xl font-black tracking-tight">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose something you'll remember this time.
          </p>
        </div>

        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">Loading...</p>
        ) : !hasSession ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or expired. Request a new one from the sign-in page.
            </p>
            <Button onClick={() => navigate("/auth")} className="w-full font-bold">
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full font-bold">
              {busy ? "Updating..." : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}