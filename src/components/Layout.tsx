import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "./MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Trophy, User, LogOut, Home, Type, Users, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import mizrahi from "@/assets/absolute-mizrahi.gif";
import { LiveStatsWindow } from "./LiveStatsWindow";
import { PlayerAvatar } from "./PlayerAvatar";

const navItems = [
  { to: "/", label: "Lobby", icon: Home, end: true },
  { to: "/wordle", label: "Wordle", icon: Type },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/leaderboard", label: "Top", icon: Trophy },
  { to: "/prediction", label: "Prediction", icon: Activity },
  { to: "/profile", label: "Me", icon: User },
];

export function Layout() {
  const { signOut } = useAuth();
  const { profile } = useUserProfile();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-foreground">
      {/* Tiled mizrahi background */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage: `url(${mizrahi})`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, hsl(25 95% 53% / 0.12), transparent), var(--gradient-dark)",
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
            <UserPill
              avatar={profile?.avatar ?? "🎰"}
              username={profile?.username ?? "player"}
              onClick={() => navigate("/profile")}
            />
            <BalancePill coins={profile?.coins ?? 0} />
            <button
              onClick={() => signOut()}
              className="touch-target flex items-center justify-center rounded-full border border-border bg-card/80 p-2 text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6">
        <Outlet />
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
                    "flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
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
  onClick,
}: {
  avatar: string;
  username: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-border bg-card/80 py-1 pl-1 pr-3 transition hover:bg-card"
      aria-label="Open profile"
    >
      <PlayerAvatar avatar={avatar} size={32} ring />
      <span className="max-w-[120px] truncate text-sm font-bold">
        {username}
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
