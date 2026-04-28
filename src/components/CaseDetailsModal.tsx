import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";

type Item = {
  id: string;
  name: string;
  image: string | null;
  value: number;
  weight: number;
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

function ImgOrEmoji({
  src,
  alt,
  className,
  fallbackClass,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClass?: string;
}) {
  if (isUrl(src)) {
    return <img src={src!} alt={alt} className={className} loading="lazy" />;
  }
  return <span className={fallbackClass ?? className}>{src ?? "🎁"}</span>;
}

export function CaseDetailsModal({
  caseId,
  caseName,
  caseImage,
  casePrice,
  onClose,
}: {
  caseId: string;
  caseName: string;
  caseImage: string | null;
  casePrice: number;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("case_items")
        .select("id,name,image,value,weight,rarity")
        .eq("case_id", caseId)
        .order("value", { ascending: false });
      setItems((data ?? []) as Item[]);
    })();
  }, [caseId]);

  const totalWeight = items?.reduce((s, i) => s + Number(i.weight), 0) ?? 0;
  const empireRate = 0.0025;
  const duelRate = 0.01;
  const empireRarities = ["legendary", "mythic"];
  const duelRarities = ["legendary", "common"];
  const empireLegendaryRateWhenBoth = 0.9;
  const empireMythicRateWhenBoth = 0.1;
  const empireLegendaryWeight = items?.reduce(
    (s, i) => (i.rarity === "legendary" ? s + Number(i.weight) : s),
    0,
  ) ?? 0;
  const empireMythicWeight = items?.reduce(
    (s, i) => (i.rarity === "mythic" ? s + Number(i.weight) : s),
    0,
  ) ?? 0;
  const empireWeight = empireLegendaryWeight + empireMythicWeight;
  const duelWeight = items?.reduce(
    (s, i) => (duelRarities.includes(i.rarity) ? s + Number(i.weight) : s),
    0,
  ) ?? 0;
  const empireActiveRate = empireWeight > 0 ? empireRate : 0;
  const duelActiveRate = duelWeight > 0 ? duelRate : 0;
  const normalRate = 1 - empireActiveRate - duelActiveRate;

  // Theoretical RTP (95% house cut applied on solo opens)
  const ev = items
    ? items.reduce((s, i) => s + (Number(i.weight) / Math.max(1, totalWeight)) * Number(i.value), 0)
    : 0;
  const rtp = casePrice > 0 ? (ev * 0.95) / casePrice : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl">
                <ImgOrEmoji
                  src={caseImage}
                  alt={caseName}
                  className="h-full w-full object-contain"
                  fallbackClass="text-4xl"
                />
              </div>
              <div>
                <h3 className="text-lg font-black">{caseName}</h3>
                <div className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                  <MizrahiCoin size={10} /> {formatCoins(casePrice)} per open
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-border bg-background p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-border p-3 text-center text-xs">
            <div>
              <div className="text-muted-foreground">Items</div>
              <div className="font-black">{items?.length ?? "..."}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Avg payout</div>
              <div className="font-black">{formatCoins(Math.round(ev))}</div>
            </div>
            <div>
              <div className="text-muted-foreground">RTP*</div>
              <div className={`font-black ${rtp >= 1 ? "text-emerald-400" : rtp >= 0.85 ? "text-amber-400" : "text-rose-400"}`}>
                {Math.round(rtp * 100)}%
              </div>
            </div>
          </div>

          <div className="max-h-[55vh] overflow-y-auto p-3">
            {!items ? (
              <p className="text-sm text-muted-foreground">Loading items...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">This case has no items.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {items.map((it) => {
                  const baseChance = totalWeight > 0 ? Number(it.weight) / totalWeight : 0;
                  const empireLegendarySplit = empireLegendaryWeight > 0 && empireMythicWeight > 0
                    ? empireLegendaryRateWhenBoth
                    : empireLegendaryWeight > 0
                      ? 1
                      : 0;
                  const empireMythicSplit = empireLegendaryWeight > 0 && empireMythicWeight > 0
                    ? empireMythicRateWhenBoth
                    : empireMythicWeight > 0
                      ? 1
                      : 0;
                  const empireChance = it.rarity === "legendary" && empireLegendaryWeight > 0
                    ? empireActiveRate * empireLegendarySplit * (Number(it.weight) / empireLegendaryWeight)
                    : it.rarity === "mythic" && empireMythicWeight > 0
                      ? empireActiveRate * empireMythicSplit * (Number(it.weight) / empireMythicWeight)
                      : 0;
                  const duelChance = duelWeight > 0 && duelRarities.includes(it.rarity)
                    ? duelActiveRate * (Number(it.weight) / duelWeight)
                    : 0;
                  const battleChance = normalRate * baseChance + empireChance + duelChance;
                  const soloPct = baseChance * 100;
                  const battlePct = battleChance * 100;
                  const nameIsUrl = isUrl(it.name);
                  // If creator typed a URL into the *name* field, treat it as the image
                  // and use a friendly fallback label instead of dumping the URL on screen.
                  const displayName = nameIsUrl ? "Mystery Item" : it.name;
                  const displayImg = it.image && it.image.length > 0 && !nameIsUrl
                    ? it.image
                    : (nameIsUrl ? it.name : it.image);
                  return (
                    <div
                      key={it.id}
                      className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-b ${
                        RARITY_BG[it.rarity] ?? RARITY_BG.common
                      } p-3 text-center`}
                    >
                      <div className="flex h-12 items-center justify-center">
                        <ImgOrEmoji
                          src={displayImg}
                          alt={displayName}
                          className="max-h-12 w-auto object-contain"
                          fallbackClass="text-4xl"
                        />
                      </div>
                      <div className="mt-1 truncate text-xs font-bold" title={displayName}>
                        {displayName}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black">
                        <MizrahiCoin size={8} /> {formatCoins(it.value)}
                      </div>
                      <div
                        className="mt-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-black text-foreground"
                        title={`1 in ${soloPct > 0 ? Math.round(100 / soloPct).toLocaleString() : "∞"} solo opens`}
                      >
                        {soloPct < 0.0001
                          ? "<0.0001"
                          : soloPct < 0.01
                            ? soloPct.toFixed(4)
                            : soloPct < 1
                              ? soloPct.toFixed(3)
                              : soloPct.toFixed(2)}
                        % <span className="opacity-60">solo</span>
                      </div>
                      <div
                        className="mt-1 rounded-full bg-primary/25 px-2 py-0.5 text-[11px] font-black text-primary"
                        title={`1 in ${battlePct > 0 ? Math.round(100 / battlePct).toLocaleString() : "∞"} battle opens`}
                      >
                        {battlePct < 0.0001
                          ? "<0.0001"
                          : battlePct < 0.01
                            ? battlePct.toFixed(4)
                            : battlePct < 1
                              ? battlePct.toFixed(3)
                              : battlePct.toFixed(2)}
                        % <span className="opacity-70">battle</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="border-t border-border p-2 text-center text-[10px] text-muted-foreground">
            Odds are exact and match the server roll. Solo = raw weights. Battle adds a 0.25% Empire spin (legendary / mythic only, 90% / 10% when both exist) and a 1% Duel spin (50% legendary / 50% common). Hover an item to see "1 in N" odds. RTP = expected solo return after 5% house edge.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
