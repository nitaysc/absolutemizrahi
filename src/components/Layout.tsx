import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "./MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Dice5, Coins, Trophy, User, LogOut, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import mizrahi from "@/assets/absolute-mizrahi.gif";

const navItems = [
  { to: "/", label: "Lobby", icon: Home, end: true },
  { to: "/dice", label: "Dice", icon: Dice5 },
  { to: "/coinflip", label: "Coinflip", icon: Coins },
  { to: "/leaderboard", label: "Top", icon: Trophy },
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
            <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-card/80 px-3 py-1.5 shadow-[0_0_18px_hsl(var(--primary)/0.18)]">
              <MizrahiCoin size={20} />
              <span className="font-bold tabular-nums">
                {formatCoins(profile?.coins ?? 0)}
              </span>
            </div>
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

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/85 backdrop-blur-xl safe-bottom">
        <ul className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 text-xs font-medium transition-colors",
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