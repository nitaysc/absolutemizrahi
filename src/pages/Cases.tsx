import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Swords, Upload, Shield, Sparkles, Package } from "lucide-react";

type Case = {
  id: string;
  name: string;
  image: string | null;
  price: number;
  is_official: boolean;
  total_opened: number;
};

type RolledItem = {
  item_id: string;
  name: string;
  image: string | null;
  value: number;
  rarity: string;
};

const RARITY_GLOW: Record<string, string> = {
  common: "from-slate-500/40 to-slate-700/20 border-slate-500/40",
  uncommon: "from-emerald-500/40 to-emerald-700/20 border-emerald-400/50",
  rare: "from-sky-500/40 to-blue-700/20 border-sky-400/50",
  epic: "from-fuchsia-500/40 to-purple-700/20 border-fuchsia-400/60",
  legendary: "from-amber-500/50 to-orange-700/20 border-amber-400/70",
  mythic: "from-rose-500/60 to-pink-700/20 border-rose-400/80",
};

export default function Cases() {
  const { profile, refetch } = useUserProfile();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [results, setResults] = useState<RolledItem[] | null>(null);
  const [openedCase, setOpenedCase] = useState<Case | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cases")
        .select("id,name,image,price,is_official,total_opened")
        .eq("status", "approved")
        .order("price");
      setCases((data ?? []) as Case[]);
      setLoading(false);
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(!!adm);
    })();
  }, []);

  async function openSolo(c: Case, count: number) {
    if (!profile) return;
    if (profile.coins < c.price * count) return toast.error("Not enough coins");
    setOpening(c.id);
    setOpenedCase(c);
    const { data, error } = await supabase.rpc("open_case_solo", {
      _case_id: c.id,
      _count: count,
    });
    setOpening(null);
    if (error) return toast.error(error.message);
    const items = (data ?? []) as RolledItem[];
    setResults(items);
    refetch();
    const total = items.reduce((s, i) => s + i.value, 0);
    toast.success(`Won ${formatCoins(Math.floor(total * 0.95))} coins!`);
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Mizrahi Cases</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">
          Open <span className="text-gradient">cases</span> · battle players
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/cases/battles" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.5)]">
            <Swords className="h-4 w-4" /> Case Battles
          </Link>
          <Link to="/cases/upload" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold">
            <Upload className="h-4 w-4" /> Upload Case
          </Link>
          {isAdmin && (
            <Link to="/cases/admin" className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-400">
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Package className="h-4 w-4" /> Available cases
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => openSolo(c, 1)}
                disabled={opening === c.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background p-4 text-left transition hover:-translate-y-1 hover:border-primary hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.6)]"
              >
                <div className="flex aspect-[3/4] flex-col items-center justify-between">
                  <div className="text-7xl drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
                    {c.image ?? "🎁"}
                  </div>
                  <div className="w-full text-center">
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
                      <MizrahiCoin size={12} /> {formatCoins(c.price)}
                    </div>
                  </div>
                </div>
                {c.is_official && (
                  <div className="absolute left-2 top-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    OFFICIAL
                  </div>
                )}
              </button>
            ))}
            {cases.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">No cases available yet.</p>
            )}
          </div>
        )}
      </section>

      <AnimatePresence>
        {results && openedCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
            onClick={() => setResults(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="relative w-full max-w-2xl rounded-3xl border border-border bg-card p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-center text-xl font-black">
                {openedCase.name} unboxed
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {results.map((r, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: i * 0.1, type: "spring" }}
                    className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-b ${
                      RARITY_GLOW[r.rarity] ?? RARITY_GLOW.common
                    } p-4 text-center`}
                  >
                    <div className="text-5xl">{r.image ?? "🎁"}</div>
                    <div className="mt-2 text-xs font-bold uppercase tracking-wide opacity-80">
                      {r.rarity}
                    </div>
                    <div className="truncate text-sm font-bold">{r.name}</div>
                    <div className="mt-1 inline-flex items-center gap-1 text-xs font-black">
                      <MizrahiCoin size={10} /> {formatCoins(r.value)}
                    </div>
                  </motion.div>
                ))}
              </div>
              <button
                onClick={() => setResults(null)}
                className="mt-5 w-full rounded-full bg-primary py-2 font-bold text-primary-foreground"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}