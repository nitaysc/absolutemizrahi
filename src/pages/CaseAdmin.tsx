import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, ChevronLeft, Eye } from "lucide-react";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";

type CaseRow = {
  id: string;
  name: string;
  image: string | null;
  price: number;
  status: string;
  is_official: boolean;
  creator_id: string | null;
  created_at: string;
  rejection_reason: string | null;
};
type ItemRow = {
  id: string;
  case_id: string;
  name: string;
  image: string | null;
  value: number;
  weight: number;
  rarity: string;
};

export default function CaseAdmin() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<Record<string, ItemRow[]>>({});
  const [creators, setCreators] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  async function load() {
    let q = supabase.from("cases").select("*").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setCases((data ?? []) as CaseRow[]);
    if (data && data.length) {
      const ids = data.map((c) => c.id);
      const { data: itemsData } = await supabase.from("case_items").select("*").in("case_id", ids);
      const map: Record<string, ItemRow[]> = {};
      (itemsData ?? []).forEach((it) => {
        (map[it.case_id] ??= []).push(it as ItemRow);
      });
      setItems(map);
      const creatorIds = Array.from(new Set(data.map((c) => c.creator_id).filter(Boolean) as string[]));
      if (creatorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,username")
          .in("id", creatorIds);
        const cmap: Record<string, string> = {};
        (profs ?? []).forEach((p) => (cmap[p.id] = p.username ?? "unknown"));
        setCreators(cmap);
      }
    }
  }

  useEffect(() => {
    (async () => {
      const { data: ok } = await supabase.rpc("is_admin");
      setAllowed(!!ok);
      if (ok) load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function approve(id: string) {
    const { error } = await supabase.rpc("approve_case", { _case_id: id });
    if (error) return toast.error(error.message);
    toast.success("Approved");
    load();
  }
  async function reject(id: string) {
    const reason = window.prompt("Rejection reason?") ?? "";
    const { error } = await supabase.rpc("reject_case", { _case_id: id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    load();
  }

  if (allowed === null) return <p className="text-muted-foreground">Loading...</p>;
  if (!allowed)
    return <p className="text-destructive">Admin only.</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h1 className="text-2xl font-black">Case Approvals (Admin)</h1>
        <div className="mt-3 flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm capitalize ${
                filter === f ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {cases.map((c) => {
          const its = items[c.id] ?? [];
          const totalW = its.reduce((s, i) => s + Number(i.weight), 0);
          const ev = totalW > 0 ? its.reduce((s, i) => s + Number(i.value) * Number(i.weight), 0) / totalW : 0;
          const rtp = c.price > 0 ? (ev / c.price) * 100 : 0;
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{c.image ?? "🎁"}</span>
                  <div>
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      by {c.creator_id ? creators[c.creator_id] ?? "..." : "Official"} · status: {c.status}
                    </div>
                    {c.rejection_reason && (
                      <div className="mt-1 text-xs text-destructive">Reason: {c.rejection_reason}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                    <MizrahiCoin size={12} /> {formatCoins(c.price)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rtp > 100 ? "bg-rose-500/20 text-rose-400" : rtp > 95 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                    RTP {rtp.toFixed(1)}%
                  </span>
                  <button
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                    className="rounded-full border border-border px-2 py-1 text-xs"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  {c.status === "pending" && (
                    <>
                      <button
                        onClick={() => approve(c.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-emerald-950"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => reject(c.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
              {open === c.id && (
                <div className="mt-3 space-y-1">
                  {its.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                      <span>
                        {i.image} <span className="font-bold">{i.name}</span>{" "}
                        <span className="text-xs text-muted-foreground">[{i.rarity}]</span>
                      </span>
                      <span className="text-xs">
                        value <b>{i.value.toLocaleString()}</b> · weight {i.weight} ·{" "}
                        {totalW > 0 ? ((Number(i.weight) / totalW) * 100).toFixed(2) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {cases.length === 0 && (
          <p className="text-sm text-muted-foreground">No cases in this filter.</p>
        )}
      </div>
    </div>
  );
}