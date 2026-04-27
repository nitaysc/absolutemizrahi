import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Swords, Upload, Shield, Package, X } from "lucide-react";
import { CaseReel, type ReelItem, type ReelResult } from "@/components/CaseReel";
import { CaseDetailsModal } from "@/components/CaseDetailsModal";

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

const RARITY_TEXT: Record<string, string> = {
  common: "text-slate-300",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-fuchsia-400",
  legendary: "text-amber-400",
  mythic: "text-rose-400",
};

export default function Cases() {
  const { profile, refetch } = useUserProfile();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [results, setResults] = useState<RolledItem[] | null>(null);
  const [openedCase, setOpenedCase] = useState<Case | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pool, setPool] = useState<ReelItem[]>([]);
  const [spinKey, setSpinKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [detailsCase, setDetailsCase] = useState<Case | null>(null);

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(!!adm);
      // Admins see every case; everyone else sees approved + their own pending.
      let q = supabase
        .from("cases")
        .select("id,name,image,price,is_official,total_opened,status,creator_id")
        .order("price");
      if (!adm) {
        q = q.in("status", ["approved", "pending"]);
      }
      const { data } = await q;
      setCases((data ?? []) as Case[]);
      setLoading(false);
    })();
  }, []);

  async function openSolo(c: Case, count: number) {
    if (!profile) return;
    if (profile.coins < c.price * count) return toast.error("Not enough coins");
    // Load item pool for the reel
    const { data: poolData } = await supabase
      .from("case_items")
      .select("name,image,value,rarity")
      .eq("case_id", c.id);
    setPool(((poolData ?? []) as ReelItem[]).length ? (poolData as ReelItem[]) : [{ name: "?", image: "❓", value: 0, rarity: "common" }]);
    setOpening(c.id);
    setOpenedCase(c);
    setResults(null);
    setRevealed(false);
    const { data, error } = await supabase.rpc("open_case_solo", {
      _case_id: c.id,
      _count: count,
    });
    setOpening(null);
    if (error) return toast.error(error.message);
    const items = (data ?? []) as RolledItem[];
    setResults(items);
    setSpinKey((k) => k + 1);
    // NOTE: do NOT refetch the balance here, otherwise the user sees their
    // coins go up before the reel finishes — leaking the result. We refetch
    // after the final reel lands (in the onComplete callback below).
  }

  function closeOpening() {
    setResults(null);
    setOpenedCase(null);
    setRevealed(false);
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
              <div
                key={c.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background p-4 transition hover:-translate-y-1 hover:border-primary hover:shadow-[0_10px_30px_-5px_hsl(var(--primary)/0.6)]"
              >
                <button
                  onClick={() => setDetailsCase(c)}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-between text-left"
                  aria-label={`See ${c.name} odds`}
                >
                  <div className="flex h-32 w-full items-center justify-center text-7xl drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
                    {c.image && /^https?:\/\//i.test(c.image) ? (
                      <img
                        src={c.image}
                        alt={c.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      c.image ?? "🎁"
                    )}
                  </div>
                  <div className="w-full text-center">
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
                      <MizrahiCoin size={12} /> {formatCoins(c.price)}
                    </div>
                  </div>
                </button>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setDetailsCase(c)}
                    className="rounded-full border border-border bg-background/60 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    Odds
                  </button>
                  <button
                    onClick={() => openSolo(c, 1)}
                    disabled={opening === c.id}
                    className="rounded-full bg-primary py-1.5 text-[11px] font-black text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)] disabled:opacity-50"
                  >
                    Open
                  </button>
                </div>
                {c.is_official && (
                  <div className="absolute left-2 top-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    OFFICIAL
                  </div>
                )}
              </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="relative w-full max-w-4xl space-y-4 rounded-3xl border border-border bg-card/80 p-5 sm:p-6"
            >
              <button
                onClick={closeOpening}
                className="absolute right-3 top-3 z-50 rounded-full border border-border bg-background/70 p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Opening</p>
                  <h3 className="flex items-center gap-2 text-2xl font-black">
                    {openedCase.image && /^https?:\/\//i.test(openedCase.image) ? (
                      <img
                        src={openedCase.image}
                        alt={openedCase.name}
                        className="h-9 w-9 rounded-md object-cover"
                      />
                    ) : (
                      <span className="text-3xl">{openedCase.image ?? "🎁"}</span>
                    )}
                    {openedCase.name}
                  </h3>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-black text-primary">
                  <MizrahiCoin size={12} /> {formatCoins(openedCase.price)}
                </div>
              </div>

              {/* Reels — one per opened item */}
              <div className="space-y-3">
                {results.map((r, i) => (
                  <CaseReel
                    key={`${spinKey}-${i}`}
                    pool={pool}
                    result={{ name: r.name, image: r.image, value: r.value, rarity: r.rarity }}
                    spinKey={`${spinKey}-${i}`}
                    durationMs={5500 + i * 250}
                    size="md"
                    onComplete={
                      i === results.length - 1
                        ? () => {
                            setRevealed(true);
                            refetch();
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              {revealed && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-border bg-background/60 p-4"
                >
                  <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    You won
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
                        {r.image && /^https?:\/\//i.test(r.image) ? (
                          <img src={r.image} alt={r.name} className="h-5 w-5 rounded object-cover" />
                        ) : (
                          <span className="text-lg">{r.image ?? "🎁"}</span>
                        )}
                        <span className={`text-xs font-bold uppercase ${RARITY_TEXT[r.rarity] ?? RARITY_TEXT.common}`}>
                          {r.rarity}
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm font-black">
                          <MizrahiCoin size={10} /> {formatCoins(r.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-center">
                    <span className="text-xs text-muted-foreground">Total payout: </span>
                    <span className="inline-flex items-center gap-1 font-black text-primary">
                      <MizrahiCoin size={12} />
                      {formatCoins(results.reduce((s, r) => s + r.value, 0))}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={closeOpening}
                      className="rounded-full border border-border bg-card py-2 text-sm font-bold"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => openSolo(openedCase, results.length)}
                      className="rounded-full bg-primary py-2 text-sm font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                    >
                      Open again
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {detailsCase && (
        <CaseDetailsModal
          caseId={detailsCase.id}
          caseName={detailsCase.name}
          caseImage={detailsCase.image}
          casePrice={detailsCase.price}
          onClose={() => setDetailsCase(null)}
        />
      )}
    </div>
  );
}