import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, ChevronLeft, Eye, Pencil, Trash2, Save } from "lucide-react";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";

function isUrl(s: string | null | undefined) {
  return !!s && /^https?:\/\//i.test(s);
}

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
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; price: number; image: string }>({
    name: "",
    price: 0,
    image: "",
  });
  const [savingId, setSavingId] = useState<string | null>(null);
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

  function startEdit(c: CaseRow) {
    setEditing(c.id);
    setEditForm({ name: c.name, price: c.price, image: c.image ?? "🎁" });
    setOpen(c.id);
  }

  async function saveCase(id: string) {
    setSavingId(id);
    const { error } = await supabase
      .from("cases")
      .update({
        name: editForm.name.trim(),
        price: Math.max(1, Math.floor(editForm.price)),
        image: editForm.image || null,
      })
      .eq("id", id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Case updated");
    setEditing(null);
    load();
  }

  async function saveItem(it: ItemRow, patch: Partial<ItemRow>) {
    const { error } = await supabase
      .from("case_items")
      .update(patch)
      .eq("id", it.id);
    if (error) return toast.error(error.message);
    setItems((prev) => {
      const arr = prev[it.case_id] ?? [];
      return {
        ...prev,
        [it.case_id]: arr.map((x) => (x.id === it.id ? { ...x, ...patch } : x)),
      };
    });
  }

  async function deleteItem(it: ItemRow) {
    if (!window.confirm(`Delete item "${it.name}"?`)) return;
    const { error } = await supabase.from("case_items").delete().eq("id", it.id);
    if (error) return toast.error(error.message);
    setItems((prev) => ({
      ...prev,
      [it.case_id]: (prev[it.case_id] ?? []).filter((x) => x.id !== it.id),
    }));
  }

  async function deleteCase(c: CaseRow) {
    if (
      !window.confirm(
        `DELETE case "${c.name}" and all its items? This cannot be undone.`,
      )
    )
      return;
    const { error } = await supabase.from("cases").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Case deleted");
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
                  {isUrl(c.image) ? (
                    <img src={c.image!} alt={c.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="text-3xl">{c.image ?? "🎁"}</span>
                  )}
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
                  <button
                    onClick={() => (editing === c.id ? setEditing(null) : startEdit(c))}
                    className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300"
                  >
                    <Pencil className="h-3 w-3" /> {editing === c.id ? "Cancel" : "Edit"}
                  </button>
                  <button
                    onClick={() => deleteCase(c)}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
              {editing === c.id && (
                <div className="mt-3 grid gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 sm:grid-cols-[1fr_120px_140px_auto]">
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Name"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    value={editForm.price}
                    min={1}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))
                    }
                    placeholder="Price"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editForm.image}
                    onChange={(e) => setEditForm((f) => ({ ...f, image: e.target.value }))}
                    placeholder="🎁 or image URL"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => saveCase(c.id)}
                    disabled={savingId === c.id}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" /> Save
                  </button>
                </div>
              )}
              {open === c.id && (
                <div className="mt-3 space-y-1">
                  {its.map((i) => (
                    <ItemRowEditor
                      key={i.id}
                      item={i}
                      totalW={totalW}
                      editing={editing === c.id}
                      onSave={(patch) => saveItem(i, patch)}
                      onDelete={() => deleteItem(i)}
                    />
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

function ItemRowEditor({
  item,
  totalW,
  editing,
  onSave,
  onDelete,
}: {
  item: ItemRow;
  totalW: number;
  editing: boolean;
  onSave: (patch: Partial<ItemRow>) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [value, setValue] = useState(item.value);
  const [weight, setWeight] = useState(Number(item.weight));
  const [rarity, setRarity] = useState(item.rarity);
  const [image, setImage] = useState(item.image ?? "");

  // Keep local state in sync if items reload
  useEffect(() => {
    setName(item.name);
    setValue(item.value);
    setWeight(Number(item.weight));
    setRarity(item.rarity);
    setImage(item.image ?? "");
  }, [item.id, item.name, item.value, item.weight, item.rarity, item.image]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
        <span>
          {isUrl(item.image) ? (
            <img
              src={item.image!}
              alt={item.name}
              className="mr-1 inline-block h-5 w-5 rounded object-cover align-middle"
            />
          ) : (
            <span className="mr-1">{item.image}</span>
          )}
          <span className="font-bold">{item.name}</span>{" "}
          <span className="text-xs text-muted-foreground">[{item.rarity}]</span>
        </span>
        <span className="text-xs">
          value <b>{item.value.toLocaleString()}</b> · weight {item.weight} ·{" "}
          {totalW > 0 ? ((Number(item.weight) / totalW) * 100).toFixed(2) : 0}%
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-1 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 text-xs sm:grid-cols-[40px_1.4fr_90px_90px_70px_70px_auto]">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded border border-border bg-card">
        {isUrl(image) ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{image || "🎁"}</span>
        )}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1"
        placeholder="Name"
      />
      <select
        value={rarity}
        onChange={(e) => setRarity(e.target.value)}
        className="rounded border border-border bg-background px-1 py-1"
      >
        {["common", "uncommon", "rare", "epic", "legendary", "mythic"].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value) || 0)}
        className="rounded border border-border bg-background px-2 py-1"
        placeholder="value"
      />
      <input
        type="number"
        step="0.01"
        value={weight}
        onChange={(e) => setWeight(Number(e.target.value) || 0)}
        className="rounded border border-border bg-background px-2 py-1"
        placeholder="weight"
      />
      <input
        value={image}
        onChange={(e) => setImage(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1"
        placeholder="emoji/url"
      />
      <div className="flex items-center gap-1">
        <button
          onClick={() =>
            void onSave({
              name: name.trim(),
              value: Math.max(0, Math.floor(value)),
              weight: Math.max(0.0001, Number(weight)),
              rarity,
              image: image || null,
            })
          }
          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 font-bold text-primary-foreground"
        >
          <Save className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded bg-destructive px-2 py-1 font-bold text-destructive-foreground"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}