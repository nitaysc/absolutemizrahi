import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Zap, Search, Coins, Package, Sparkles, X } from "lucide-react";

type InventoryItem = {
  id: string;
  item_name: string;
  item_image: string | null;
  rarity: string;
  value: number;
  source: string;
};
type CatalogItem = {
  id: string;
  name: string;
  image: string | null;
  value: number;
  rarity: string;
};

const RARITY_BG: Record<string, string> = {
  common: "from-slate-600/20 to-slate-900/60 border-slate-500/40",
  uncommon: "from-emerald-500/25 to-emerald-950/60 border-emerald-400/50",
  rare: "from-sky-500/30 to-blue-950/60 border-sky-400/60",
  epic: "from-fuchsia-500/30 to-purple-950/60 border-fuchsia-400/70",
  legendary: "from-amber-400/35 to-orange-950/60 border-amber-300/80",
  mythic: "from-rose-500/40 to-pink-950/65 border-rose-300/90",
};

function isUrl(s: string | null | undefined) {
  return !!s && /^https?:\/\//i.test(s);
}
function ItemImg({ src, name, size = 14 }: { src: string | null; name: string; size?: number }) {
  const display = isUrl(src) ? src : isUrl(name) ? name : null;
  if (display) {
    return <img src={display} alt="" className={`h-${size} w-${size} object-contain`} loading="lazy" />;
  }
  return <span className={`text-${size > 12 ? "4xl" : "2xl"}`}>{src ?? "🎁"}</span>;
}

export default function Upgrader() {
  const SPIN_DURATION_SEC = 2.8;
  const { profile, refetch } = useUserProfile();
  const [inv, setInv] = useState<InventoryItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cash, setCash] = useState<number>(0);
  const [target, setTarget] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    won: boolean;
    chance: number;
    roll: number;
    target: CatalogItem;
  }>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);

  async function load() {
    const [{ data: invData }, { data: catData }] = await Promise.all([
      supabase
        .from("inventory")
        .select("id,item_name,item_image,rarity,value,source")
        .eq("status", "held")
        .order("value", { ascending: false }),
      supabase
        .from("case_items")
        .select("id,name,image,value,rarity")
        .order("value", { ascending: false })
        .limit(400),
    ]);
    setInv((invData ?? []) as InventoryItem[]);
    // dedupe catalog by name+value to keep list clean
    const seen = new Set<string>();
    const cat: CatalogItem[] = [];
    for (const ci of (catData ?? []) as CatalogItem[]) {
      const k = `${ci.name}::${ci.value}`;
      if (seen.has(k)) continue;
      seen.add(k);
      cat.push(ci);
    }
    setCatalog(cat);
  }
  useEffect(() => {
    load();
  }, []);

  const stakeFromItems = useMemo(
    () => inv.filter((i) => selectedIds.has(i.id)).reduce((s, i) => s + Number(i.value), 0),
    [inv, selectedIds],
  );
  const totalStake = stakeFromItems + Math.max(0, Math.floor(cash || 0));
  const chance = useMemo(() => {
    if (!target || totalStake <= 0) return 0;
    if (totalStake >= target.value) return 0;
    return Math.min(0.95, (totalStake / target.value) * 0.9);
  }, [target, totalStake]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .filter((c) => (totalStake > 0 ? c.value > totalStake : true))
      .slice(0, 60);
  }, [catalog, search, totalStake]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function startUpgrade() {
    if (!target) return toast.error("Pick a target item");
    if (totalStake <= 0) return toast.error("Add stake");
    if (totalStake >= target.value) return toast.error("Stake must be lower than target");
    if (cash > 0 && profile && profile.coins < cash) return toast.error("Not enough coins");

    setBusy(true);
    setSpinning(true);
    setResult(null);
    const { data, error } = await supabase.rpc("upgrade_inventory" as any, {
      _item_ids: Array.from(selectedIds),
      _cash: Math.floor(cash || 0),
      _target_value: target.value,
      _target_name: target.name,
      _target_image: target.image,
      _target_rarity: target.rarity,
    });
    if (error) {
      setBusy(false);
      setSpinning(false);
      return toast.error(error.message);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const won = !!row?.won;
    const roll = Number(row?.roll ?? 0);
    const normalizedRoll = Math.min(0.9999, Math.max(0, roll));
    const landingRotation = (1 - normalizedRoll) * 360;
    setWheelRotation((prev) => prev + 360 * 5 + landingRotation);
    await new Promise((r) => setTimeout(r, SPIN_DURATION_SEC * 1000));
    setResult({
      won,
      chance: Number(row?.chance ?? chance),
      roll,
      target,
    });
    setSpinning(false);
    setBusy(false);
    setSelectedIds(new Set());
    setCash(0);
    refetch();
    load();
    if (won) toast.success(`UPGRADED! ${target.name} is yours.`);
    else toast.error("Upgrade failed — stake lost.");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/inventory"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label="Back to inventory"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
              <Zap className="h-7 w-7 text-fuchsia-400" /> UPGRADER
            </h1>
            <p className="text-sm text-muted-foreground">
              Risk your items (and/or coins) for a shot at a bigger item. Lose the roll, lose the stake. House edge 10%.
            </p>
          </div>
        </div>
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/50"
        >
          <Package className="h-4 w-4" /> Inventory
        </Link>
      </header>

      {/* Wheel + summary */}
      <section className="rounded-3xl border border-fuchsia-400/30 bg-gradient-to-b from-fuchsia-950/30 via-background to-background p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
          {/* Stake side */}
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Your stake (items + coins)
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-2xl font-black">
              <MizrahiCoin size={18} /> {formatCoins(totalStake)}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} ·{" "}
              {formatCoins(Math.floor(cash || 0))} coins
            </div>
            {target && totalStake > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-black text-fuchsia-200">
                ×{(target.value / totalStake).toFixed(2)} multiplier
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-300" />
              <input
                type="number"
                min={0}
                value={cash || ""}
                onChange={(e) => setCash(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                placeholder="Add coins (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-bold outline-none focus:border-primary"
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Tip: you can stake items only — no coins required. Just pick skins below.
            </p>
          </div>

          {/* Wheel */}
          <div className="relative mx-auto h-44 w-44 select-none">
            <motion.div
              animate={{ rotate: wheelRotation }}
              transition={{ duration: SPIN_DURATION_SEC, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border-[6px] border-fuchsia-400/40"
              style={{
                background: `conic-gradient(from -90deg, hsl(var(--primary)) 0 ${chance * 360}deg, hsl(var(--muted)) ${chance * 360}deg 360deg)`,
              }}
            />
            <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-background/95">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Chance
              </div>
              <div className="text-3xl font-black text-primary">
                {(chance * 100).toFixed(1)}%
              </div>
              {target && (
                <div className="mt-1 text-[10px] font-bold text-amber-300">
                  win {formatCoins(target.value)}
                </div>
              )}
            </div>
            {/* pointer */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1">
              <div className="h-0 w-0 border-x-[8px] border-t-[14px] border-x-transparent border-t-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.9)]" />
            </div>
          </div>

          {/* Target side */}
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Target item
            </div>
            {target ? (
              <div
                className={`mt-2 flex items-center gap-3 rounded-xl border bg-gradient-to-b p-3 ${RARITY_BG[target.rarity] ?? RARITY_BG.common}`}
              >
                <ItemImg src={target.image} name={target.name} size={14} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{target.name}</div>
                  <div className="inline-flex items-center gap-1 text-sm font-black text-primary">
                    <MizrahiCoin size={10} /> {formatCoins(target.value)}
                  </div>
                </div>
                <button
                  onClick={() => setTarget(null)}
                  className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  aria-label="Clear target"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Pick a target from the catalog below.
              </p>
            )}
            <button
              onClick={startUpgrade}
              disabled={busy || !target || totalStake <= 0 || (target && totalStake >= target.value)}
              className="mt-3 w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-primary px-4 py-2 text-sm font-black uppercase tracking-wider text-background shadow-[0_0_22px_hsl(var(--primary)/0.55)] transition hover:brightness-110 disabled:opacity-40"
            >
              {spinning ? "Upgrading..." : busy ? "..." : "⚡ Start Upgrade"}
            </button>
          </div>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && !spinning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-4 rounded-2xl border-2 p-4 text-center ${
                result.won
                  ? "border-emerald-400/60 bg-emerald-500/10"
                  : "border-rose-400/60 bg-rose-500/10"
              }`}
            >
              <div
                className={`text-2xl font-black ${result.won ? "text-emerald-300" : "text-rose-300"}`}
              >
                {result.won ? `🎉 WON ${result.target.name}!` : "💥 BUSTED — stake lost"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Chance was {(result.chance * 100).toFixed(1)}% · roll{" "}
                {(result.roll * 100).toFixed(1)}%
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Inventory selection */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground">
            <Package className="h-4 w-4" /> Stake from inventory
          </h2>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        {inv.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No items in inventory. Open cases or join a battle first.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {inv.map((it) => {
              const sel = selectedIds.has(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => toggle(it.id)}
                  className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-b p-2 text-center transition ${
                    RARITY_BG[it.rarity] ?? RARITY_BG.common
                  } ${sel ? "ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-background scale-[0.97]" : "hover:brightness-110"}`}
                >
                  {sel && (
                    <Sparkles className="absolute right-1 top-1 h-3.5 w-3.5 text-fuchsia-300" />
                  )}
                  <div className="mx-auto flex h-12 items-center justify-center">
                    <ItemImg src={it.item_image} name={it.item_name} size={10} />
                  </div>
                  <div className="mt-1 truncate text-[10px] font-bold">
                    {isUrl(it.item_name) ? "Mystery" : it.item_name}
                  </div>
                  <div className="inline-flex items-center gap-0.5 text-[11px] font-black text-primary">
                    <MizrahiCoin size={8} /> {formatCoins(it.value)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Target catalog */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground">
            <Zap className="h-4 w-4" /> Pick a target
          </h2>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items"
              className="w-56 rounded-full border border-border bg-card pl-7 pr-3 py-1.5 text-xs font-bold outline-none focus:border-primary"
            />
          </div>
        </div>
        {filteredCatalog.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            {totalStake > 0
              ? "No items priced higher than your stake."
              : "Add stake to see possible targets."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {filteredCatalog.map((c) => {
              const isSel = target?.id === c.id;
              const ch =
                totalStake > 0 && totalStake < c.value
                  ? Math.min(0.95, (totalStake / c.value) * 0.9)
                  : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setTarget(c)}
                  className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-b p-2 text-center transition ${
                    RARITY_BG[c.rarity] ?? RARITY_BG.common
                  } ${isSel ? "ring-2 ring-amber-300" : "hover:brightness-110"}`}
                >
                  <div className="mx-auto flex h-14 items-center justify-center">
                    <ItemImg src={c.image} name={c.name} size={12} />
                  </div>
                  <div className="mt-1 truncate text-[11px] font-bold">{c.name}</div>
                  <div className="inline-flex items-center gap-0.5 text-xs font-black text-primary">
                    <MizrahiCoin size={9} /> {formatCoins(c.value)}
                  </div>
                  <div className="text-[10px] font-bold text-fuchsia-300">
                    {(ch * 100).toFixed(1)}%
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
