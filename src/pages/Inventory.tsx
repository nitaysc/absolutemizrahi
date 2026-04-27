import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { Package, ArrowLeft, Coins, Swords, Gift } from "lucide-react";

type InventoryItem = {
  id: string;
  item_name: string;
  item_image: string | null;
  rarity: string;
  value: number;
  source: string;
  source_ref: string | null;
  created_at: string;
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

function ItemImg({ src, name }: { src: string | null; name: string }) {
  // Fall back to the name field if it itself is a URL (some items store the
  // image URL inside the name field — see CaseAdmin validation).
  const nameIsUrl = isUrl(name);
  const display = isUrl(src) ? src : nameIsUrl ? name : null;
  if (display) {
    return <img src={display} alt="" className="h-14 w-14 object-contain" loading="lazy" />;
  }
  return <span className="text-4xl">{src ?? "🎁"}</span>;
}

export default function Inventory() {
  const { refetch } = useUserProfile();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [filter, setFilter] = useState<"all" | "solo" | "battle">("all");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("status", "held")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data ?? []) as InventoryItem[]);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = (items ?? []).filter((it) =>
    filter === "all" ? true : it.source === filter,
  );
  const grossTotal = filtered.reduce((s, it) => s + Number(it.value), 0);
  const netTotal = Math.floor((grossTotal * 9500) / 10000);

  async function sellOne(id: string) {
    setBusy(id);
    const { data, error } = await supabase.rpc("sell_inventory_item", { _item_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Sold for ${formatCoins(Number(data ?? 0))} coins`);
    refetch();
    load();
  }

  async function sellAll() {
    if (!filtered.length) return;
    setBusy("ALL");
    const { data, error } = await supabase.rpc("sell_all_inventory");
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Cashed out ${formatCoins(Number(data ?? 0))} coins`);
    refetch();
    load();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">
              <Package className="h-7 w-7 text-primary" /> INVENTORY
            </h1>
            <p className="text-sm text-muted-foreground">
              Items you won. Sell anytime to convert to coins (5% house cut).
            </p>
          </div>
        </div>
      </header>

      {/* Totals + sell-all */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Items held
          </div>
          <div className="mt-1 text-2xl font-black">{filtered.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Gross value
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-2xl font-black text-foreground">
            <MizrahiCoin size={18} /> {formatCoins(grossTotal)}
          </div>
        </div>
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Net if sold (95%)
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-2xl font-black text-primary">
            <MizrahiCoin size={18} /> {formatCoins(netTotal)}
          </div>
        </div>
      </section>

      {/* Filter + sell all */}
      <section className="flex flex-wrap items-center gap-2">
        {(["all", "solo", "battle"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wider transition ${
              filter === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? "All" : k === "solo" ? "Case opens" : "Battle wins"}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={sellAll}
            disabled={!filtered.length || busy === "ALL"}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_18px_hsl(var(--primary)/0.45)] transition hover:brightness-110 disabled:opacity-40"
          >
            <Coins className="h-3.5 w-3.5" />
            {busy === "ALL" ? "Selling..." : `Sell all · +${formatCoins(netTotal)}`}
          </button>
        </div>
      </section>

      {/* Grid */}
      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading inventory...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Gift className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">No items yet</p>
          <p className="text-xs text-muted-foreground">
            Open a case or win a battle and your loot will land here.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              to="/cases"
              className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase text-background hover:brightness-110"
            >
              Open cases
            </Link>
            <Link
              to="/cases/battles"
              className="rounded-full border border-border bg-card px-4 py-2 text-xs font-black uppercase hover:bg-card/80"
            >
              Join a battle
            </Link>
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((it) => {
              const sellPayout = Math.floor((Number(it.value) * 9500) / 10000);
              return (
                <motion.div
                  key={it.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-b ${
                    RARITY_BG[it.rarity] ?? RARITY_BG.common
                  } p-3 text-center`}
                >
                  <div className="absolute right-2 top-2">
                    {it.source === "battle" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-200">
                        <Swords className="h-2.5 w-2.5" /> Battle
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-200">
                        Case
                      </span>
                    )}
                  </div>
                  <div className="mx-auto mt-1 flex h-16 items-center justify-center">
                    <ItemImg src={it.item_image} name={it.item_name} />
                  </div>
                  <div className="mt-2 truncate text-xs font-bold" title={isUrl(it.item_name) ? "Mystery item" : it.item_name}>
                    {isUrl(it.item_name) ? "Mystery item" : it.item_name}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-sm font-black text-primary">
                    <MizrahiCoin size={10} /> {formatCoins(it.value)}
                  </div>
                  <button
                    onClick={() => sellOne(it.id)}
                    disabled={busy === it.id}
                    className="mt-2 w-full rounded-full bg-foreground/90 px-2 py-1.5 text-[11px] font-black uppercase tracking-wider text-background transition hover:bg-foreground disabled:opacity-50"
                  >
                    {busy === it.id ? "Selling..." : `Sell · +${formatCoins(sellPayout)}`}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}