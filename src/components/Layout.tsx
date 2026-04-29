import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "./MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Trophy, User, LogOut, Home, Type, Users, Activity, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import mizrahi from "@/assets/absolute-mizrahi.gif";
import { LiveStatsWindow } from "./LiveStatsWindow";
import { PlayerAvatar } from "./PlayerAvatar";
import { LevelBar } from "./LevelBar";
import { LevelBadge } from "./LevelBadge";
import { useProgression } from "@/hooks/useProgression";
import { Trophy as TrophyIcon, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CinematicBackground } from "./CinematicBackground";
import { PageTransition } from "./PageTransition";

const navItems = [
  { to: "/", label: "Lobby", icon: Home, end: true },
  { to: "/wordle", label: "Wordle", icon: Type },
  { to: "/progression", label: "Quests", icon: Sparkles },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/leaderboard", label: "Top", icon: Trophy },
  { to: "/prediction", label: "Prediction", icon: Activity },
  { to: "/profile", label: "Me", icon: User },
];

export function Layout() {
  const { signOut, user } = useAuth();
  const { profile } = useUserProfile();
  const { stats } = useProgression();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_admin");
      if (!cancelled) setIsAdmin(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-foreground">
      {/* Cinematic background (aurora orbs + grid + vignette) */}
      <CinematicBackground />
      {/* Faint mizrahi tile texture on top of aurora */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage: `url(${mizrahi})`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px",
          mixBlendMode: "overlay",
        }}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 font-black tracking-tight"
          >
            <img src={mizrahi} alt="" className="h-8 w-8 rounded-lg ring-2 ring-primary/40" />
            <span className="text-lg leading-none">
              <span className="text-gradient">MIZRAHI</span>
              <span className="text-foreground/70"> CASINO</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/progression")}
              className="hidden sm:block"
              aria-label="Open progression"
            >
              <LevelBar />
            </button>
            <UserPill
              avatar={profile?.avatar ?? "🎰"}
              username={profile?.username ?? "player"}
              level={stats?.level ?? null}
              onClick={() => navigate("/profile")}
            />
            <BalancePill coins={profile?.coins ?? 0} />
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="touch-target flex items-center justify-center rounded-full border border-destructive/40 bg-destructive/15 p-2 text-destructive shadow-[0_0_12px_hsl(var(--destructive)/0.3)] transition hover:bg-destructive/25"
                aria-label="Open admin dashboard"
                title="Admin dashboard"
              >
                <Crown className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => signOut()}
              className="touch-target flex items-center justify-center rounded-full border border-border bg-card/80 p-2 text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Mobile-only level bar row */}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-2 sm:hidden">
          <button
            onClick={() => navigate("/progression")}
            className="flex w-full items-center"
            aria-label="Open progression"
          >
            <LevelBar className="w-full" />
          </button>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Floating live-stats window (drag by title bar) */}
      <LiveStatsWindow />

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/85 backdrop-blur-xl safe-bottom">
        <ul className="mx-auto flex max-w-5xl items-center justify-around overflow-x-auto px-1 py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="bottom-nav-indicator"
                        className="absolute inset-0 -z-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 shadow-[0_0_18px_hsl(var(--primary)/0.35)]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function UserPill({
  avatar,
  username,
  level,
  onClick,
}: {
  avatar: string;
  username: string;
  level: number | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-border bg-card/80 py-1 pl-1 pr-3 transition hover:bg-card"
      aria-label="Open profile"
    >
      <PlayerAvatar avatar={avatar} size={32} ring />
      <span className="flex items-center gap-1">
        {level !== null && <LevelBadge level={level} size="xs" />}
        <span className="max-w-[100px] truncate text-sm font-bold">{username}</span>
      </span>
    </button>
  );
}

/** Balance pill that briefly pulses when the value changes (delta tick). */
function BalancePill({ coins }: { coins: number }) {
  const [prev, setPrev] = useState(coins);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (coins !== prev) {
      setDelta(coins - prev);
      setPrev(coins);
      const t = setTimeout(() => setDelta(null), 1100);
      return () => clearTimeout(t);
    }
  }, [coins, prev]);

  return (
    <div className="relative flex items-center gap-2 rounded-full border border-primary/30 bg-card/80 px-3 py-1.5 shadow-[0_0_18px_hsl(var(--primary)/0.18)]">
      <MizrahiCoin size={20} />
      <span className="font-bold tabular-nums">{formatCoins(coins)}</span>
      {delta !== null && delta !== 0 && (
        <span
          key={delta}
          className={cn(
            "pointer-events-none absolute -top-2 right-2 animate-[fade-in_0.2s_ease-out] rounded-full px-2 py-0.5 text-[10px] font-black",
            delta > 0
              ? "bg-[hsl(var(--success))] text-background"
              : "bg-destructive text-destructive-foreground",
          )}
        >
          {delta > 0 ? "+" : ""}
          {formatCoins(delta)}
        </span>
      )}
    </div>
  );
}
