import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { toast } from "sonner";
import { ChevronLeft, Plus, Minus, Info } from "lucide-react";
import { CaseDetailsModal } from "@/components/CaseDetailsModal";

type Case = { id: string; name: string; image: string | null; price: number };

const MODES = [
  { v: "1v1", label: "1 v 1", slots: 2 },
  { v: "1v1v1", label: "1 v 1 v 1", slots: 3 },
  { v: "1v1v1v1", label: "1 v 1 v 1 v 1", slots: 4 },
  { v: "2v2", label: "2 v 2", slots: 4 },
  { v: "3v3", label: "3 v 3", slots: 6 },
];

const TYPES = [
  { v: "normal", label: "Normal", desc: "Highest total wins" },
  { v: "crazy", label: "Crazy", desc: "LOWEST total wins" },
  { v: "group", label: "Group", desc: "Pool wins together" },
  { v: "terminal", label: "Terminal", desc: "Last roll only" },
];

export default function CaseBattleCreate() {
  const { profile, refetch } = useUserProfile();
  const [searchParams] = useSearchParams();
  const [allCases, setAllCases] = useState<Case[]>([]);
  const [picks, setPicks] = useState<Record<string, number>>(() => {
    const cs = searchParams.get("cases");
    if (!cs) return {};
    const out: Record<string, number> = {};
    cs.split(",")
      .filter(Boolean)
      .forEach((id) => (out[id] = (out[id] ?? 0) + 1));
    return out;
  });
  const [mode, setMode] = useState(searchParams.get("mode") ?? "1v1");
  const [type, setType] = useState<"normal" | "crazy" | "group" | "terminal">(
    (searchParams.get("type") as "normal" | "crazy" | "group" | "terminal") ?? "normal",
  );
  const [fillBots, setFillBots] = useState(searchParams.get("bots") === "1");
  const [fast, setFast] = useState(searchParams.get("fast") === "1");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailsCase, setDetailsCase] = useState<Case | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cases")
        .select("id,name,image,price")
        .eq("status", "approved")
        .order("price");
      setAllCases((data ?? []) as Case[]);
    })();
  }, []);

  const totalCost = allCases.reduce((s, c) => s + (picks[c.id] ?? 0) * c.price, 0);
  const totalCases = Object.values(picks).reduce((s, n) => s + n, 0);

  function bump(id: string, delta: number) {
    setPicks((p) => {
      const n = Math.max(0, Math.min(50, (p[id] ?? 0) + delta));
      const out = { ...p };
      if (n === 0) delete out[id];
      else out[id] = n;
      return out;
    });
  }

  async function create() {
    if (totalCases === 0) return toast.error("Pick at least 1 case");
    if (!profile || profile.coins < totalCost) return toast.error("Not enough coins");
    const ids: string[] = [];
    for (const [id, n] of Object.entries(picks)) for (let i = 0; i < n; i++) ids.push(id);
    setCreating(true);
    const { data, error } = await supabase.rpc("create_case_battle", {
      _mode: mode,
      _type: type,
      _case_ids: ids,
      _fill_with_bots: fillBots,
      _fast: fast,
      _private: isPrivate,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    refetch();
    navigate(`/cases/battles/${data}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Settings */}
      <aside className="space-y-3 rounded-3xl border border-border bg-card/70 p-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-xl font-black">Battle Settings</h2>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Mode
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2"
          >
            {MODES.map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Type
          </label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.v}
                onClick={() => setType(t.v as typeof type)}
                className={`rounded-xl border p-2 text-left text-sm transition ${
                  type === t.v
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background"
                }`}
              >
                <div className="font-bold">{t.label}</div>
                <div className="text-[10px] text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-background p-3">
          <Toggle label="Fill with Bots" value={fillBots} onChange={setFillBots} />
          <Toggle label="Fast Mode" value={fast} onChange={setFast} />
          <Toggle label="Private" value={isPrivate} onChange={setIsPrivate} />
        </div>

        <div className="rounded-xl border border-border bg-background p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cases</span>
            <span className="font-bold">{totalCases}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost / player</span>
            <span className="inline-flex items-center gap-1 font-bold">
              <MizrahiCoin size={12} /> {formatCoins(totalCost)}
            </span>
          </div>
        </div>

        <button
          onClick={create}
          disabled={creating || totalCases === 0}
          className="w-full rounded-full bg-primary py-2.5 font-black text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
        >
          {creating ? "Creating..." : `Create for ${formatCoins(totalCost)}`}
        </button>
      </aside>

      {/* Case picker */}
      <main className="space-y-3 rounded-3xl border border-border bg-card/70 p-5">
        <h2 className="text-lg font-black">Select Cases</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {allCases.map((c) => {
            const n = picks[c.id] ?? 0;
            return (
              <div
                key={c.id}
                className={`relative rounded-2xl border bg-background p-3 text-center transition ${
                  n > 0 ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.4)]" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDetailsCase(c)}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
                  title="See contents & odds"
                >
                  <Info className="h-3 w-3" /> Info
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsCase(c)}
                  className="block w-full"
                  aria-label={`View ${c.name} contents`}
                >
                  <div className="flex h-20 w-full items-center justify-center text-5xl">
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
                  <div className="mt-1 truncate text-sm font-bold">{c.name}</div>
                </button>
                <div className="inline-flex items-center gap-1 text-xs text-primary">
                  <MizrahiCoin size={10} /> {formatCoins(c.price)}
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    onClick={() => bump(c.id, -1)}
                    className="rounded-md border border-border p-1"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center font-bold">{n}</span>
                  <button
                    onClick={() => bump(c.id, 1)}
                    className="rounded-md border border-border p-1"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

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

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between text-sm"
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition ${
            value ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}