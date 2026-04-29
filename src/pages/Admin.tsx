import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCoins } from "@/lib/format";
import { Crown, Coins, Sparkles, Skull, Package, ShieldCheck } from "lucide-react";

/**
 * Consolidated admin dashboard.
 * Replaces the scattered admin sections that used to live across the app.
 * Admin status is checked by the server-side `is_admin()` function — the
 * RPCs themselves enforce permission too, so this page is just a UX gate.
 */
export default function Admin() {
  const { user } = useAuth();
  const { profile, setLocalCoins } = useUserProfile();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Grant coins
  const [coinsTo, setCoinsTo] = useState("");
  const [coinsAmt, setCoinsAmt] = useState("");
  const [grantingCoins, setGrantingCoins] = useState(false);

  // Grant XP
  const [xpTo, setXpTo] = useState("");
  const [xpAmt, setXpAmt] = useState("");
  const [grantingXp, setGrantingXp] = useState(false);

  // Reset player
  const [resetTo, setResetTo] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_admin");
      if (!cancelled) setIsAdmin(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (isAdmin === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Checking permissions…
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  async function grantCoins() {
    const u = coinsTo.trim();
    const amt = Math.floor(Number(coinsAmt));
    if (!u) return toast.error("Enter a username");
    if (!Number.isFinite(amt) || amt === 0) return toast.error("Enter a valid amount");
    setGrantingCoins(true);
    const { data, error } = await supabase.rpc("admin_grant_coins", {
      _recipient_username: u,
      _amount: amt,
    });
    setGrantingCoins(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      toast.success(
        `${amt > 0 ? "+" : ""}${formatCoins(Number(r.amount))} → ${r.recipient_username} (now ${formatCoins(Number(r.recipient_balance))})`,
      );
      if (u.toLowerCase() === (profile?.username ?? "").toLowerCase()) {
        setLocalCoins(Number(r.recipient_balance));
      }
      setCoinsTo("");
      setCoinsAmt("");
    }
  }

  async function grantXp() {
    const u = xpTo.trim();
    const amt = Math.floor(Number(xpAmt));
    if (!u) return toast.error("Enter a username");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("XP must be positive");
    setGrantingXp(true);
    const { data, error } = await supabase.rpc("admin_grant_xp", {
      _recipient_username: u,
      _amount: amt,
    });
    setGrantingXp(false);
    if (error) return toast.error(error.message);
    // Some RPCs return rows, some scalar — handle either.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = Array.isArray(data) ? data[0] : data;
    toast.success(
      r?.recipient_username
        ? `+${formatCoins(amt)} XP → ${r.recipient_username}`
        : `+${formatCoins(amt)} XP → ${u}`,
    );
    setXpTo("");
    setXpAmt("");
  }

  async function resetPlayer() {
    const u = resetTo.trim();
    if (!u) return toast.error("Enter a username");
    const ok = window.confirm(
      `Reset EVERYTHING for "${u}"?\n\nThis wipes coins, level, XP, streaks, missions, achievements, predictions and bet history. This cannot be undone.`,
    );
    if (!ok) return;
    setResetting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("admin_reset_player", { _username: u });
    setResetting(false);
    if (error) return toast.error(error.message);
    toast.success(`${u} has been fully reset`);
    setResetTo("");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-destructive/40 bg-gradient-to-br from-destructive/10 via-card/70 to-transparent p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/20 text-2xl">
            <Crown className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-destructive">
              Admin dashboard
            </p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Operator tools</h1>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
          Everything in here directly affects real player accounts. Double-check usernames and
          amounts before pressing the action buttons.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard
          icon={<Coins className="h-5 w-5 text-amber-300" />}
          title="Grant coins"
          tone="warning"
          description="Add (or subtract with a negative amount) coins for any player."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              value={coinsTo}
              onChange={(e) => setCoinsTo(e.target.value)}
              placeholder="Username"
              disabled={grantingCoins}
            />
            <Input
              type="number"
              inputMode="numeric"
              value={coinsAmt}
              onChange={(e) => setCoinsAmt(e.target.value)}
              placeholder="Amount"
              disabled={grantingCoins}
              onKeyDown={(e) => {
                if (e.key === "Enter") grantCoins();
              }}
            />
            <Button
              onClick={grantCoins}
              disabled={grantingCoins || !coinsTo.trim() || !coinsAmt}
            >
              {grantingCoins ? "..." : "Grant"}
            </Button>
          </div>
        </AdminCard>

        <AdminCard
          icon={<Sparkles className="h-5 w-5 text-primary" />}
          title="Grant XP"
          tone="primary"
          description="Push a player up the level track. Triggers level-ups & rewards normally."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              value={xpTo}
              onChange={(e) => setXpTo(e.target.value)}
              placeholder="Username"
              disabled={grantingXp}
            />
            <Input
              type="number"
              inputMode="numeric"
              value={xpAmt}
              onChange={(e) => setXpAmt(e.target.value)}
              placeholder="XP amount"
              disabled={grantingXp}
              onKeyDown={(e) => {
                if (e.key === "Enter") grantXp();
              }}
            />
            <Button
              onClick={grantXp}
              disabled={grantingXp || !xpTo.trim() || !xpAmt}
            >
              {grantingXp ? "..." : "Grant XP"}
            </Button>
          </div>
        </AdminCard>

        <AdminCard
          icon={<Skull className="h-5 w-5 text-destructive" />}
          title="Reset player"
          tone="danger"
          description="Wipe coins, level, XP, streaks, missions, achievements & history. Irreversible."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              value={resetTo}
              onChange={(e) => setResetTo(e.target.value)}
              placeholder="Username"
              disabled={resetting}
              onKeyDown={(e) => {
                if (e.key === "Enter") resetPlayer();
              }}
            />
            <Button
              onClick={resetPlayer}
              disabled={resetting || !resetTo.trim()}
              variant="destructive"
            >
              {resetting ? "Resetting..." : "Reset everything"}
            </Button>
          </div>
        </AdminCard>

        <AdminCard
          icon={<Package className="h-5 w-5 text-sky-300" />}
          title="Case admin"
          tone="info"
          description="Approve, reject and manage user-submitted cases."
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/cases/admin">
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Open case admin
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/cases/upload">Upload a case</Link>
            </Button>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function AdminCard({
  icon,
  title,
  description,
  children,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  tone: "warning" | "danger" | "primary" | "info";
}) {
  const border =
    tone === "danger"
      ? "border-destructive/40"
      : tone === "warning"
        ? "border-amber-400/40"
        : tone === "info"
          ? "border-sky-400/40"
          : "border-primary/40";
  return (
    <section className={`rounded-3xl border ${border} bg-card/70 p-5 backdrop-blur-xl`}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}