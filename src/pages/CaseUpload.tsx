import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft } from "lucide-react";

type Item = {
  name: string;
  image: string;
  value: number;
  weight: number;
  rarity: string;
};

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export default function CaseUpload() {
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [image, setImage] = useState("🎁");
  const [price, setPrice] = useState(500);
  const [items, setItems] = useState<Item[]>([
    { name: "", image: "🎁", value: 100, weight: 50, rarity: "common" },
  ]);
  const [busy, setBusy] = useState(false);

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const ev =
    totalWeight > 0
      ? items.reduce((s, i) => s + (Number(i.value) || 0) * (Number(i.weight) || 0), 0) /
        totalWeight
      : 0;

  function update(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit() {
    if (!profile) return;
    if (!name.trim()) return toast.error("Name required");
    if (price < 1) return toast.error("Invalid price");
    if (items.length === 0) return toast.error("Add at least one item");
    if (items.some((i) => !i.name.trim() || i.weight <= 0))
      return toast.error("Each item needs a name and weight > 0");

    setBusy(true);
    const { data: c, error: ce } = await supabase
      .from("cases")
      .insert({
        name: name.trim(),
        image,
        price,
        creator_id: profile.id,
        status: "pending",
        is_official: false,
      })
      .select("id")
      .single();
    if (ce || !c) {
      setBusy(false);
      return toast.error(ce?.message ?? "Failed");
    }
    const { error: ie } = await supabase.from("case_items").insert(
      items.map((i) => ({
        case_id: c.id,
        name: i.name.trim(),
        image: i.image,
        value: Math.floor(i.value),
        weight: Number(i.weight),
        rarity: i.rarity,
      }))
    );
    setBusy(false);
    if (ie) return toast.error(ie.message);
    toast.success("Case submitted! Awaiting admin approval.");
    navigate("/cases");
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div className="rounded-3xl border border-border bg-card/70 p-5">
        <h1 className="text-2xl font-black">Upload Custom Case</h1>
        <p className="text-sm text-muted-foreground">
          Submit a case for admin approval. Item weights determine drop %.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Case name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="My Awesome Case"
            />
          </Field>
          <Field label="Emoji icon">
            <input
              value={image}
              onChange={(e) => setImage(e.target.value.slice(0, 4))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-2xl"
            />
          </Field>
          <Field label="Price (coins)">
            <input
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card/70 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">Items</h2>
          <button
            onClick={() =>
              setItems((a) => [
                ...a,
                { name: "", image: "🎁", value: 100, weight: 10, rarity: "common" },
              ])
            }
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-3 w-3" /> Add item
          </button>
        </div>

        <div className="space-y-2">
          {items.map((it, idx) => {
            const dropPct = totalWeight > 0 ? ((Number(it.weight) / totalWeight) * 100).toFixed(2) : "0";
            return (
              <div
                key={idx}
                className="grid grid-cols-12 items-center gap-2 rounded-xl border border-border bg-background p-2"
              >
                <input
                  value={it.image}
                  onChange={(e) => update(idx, { image: e.target.value.slice(0, 4) })}
                  className="col-span-1 rounded-lg border border-border bg-card px-2 py-1.5 text-center"
                />
                <input
                  value={it.name}
                  onChange={(e) => update(idx, { name: e.target.value.slice(0, 50) })}
                  placeholder="Item name"
                  className="col-span-3 rounded-lg border border-border bg-card px-2 py-1.5"
                />
                <select
                  value={it.rarity}
                  onChange={(e) => update(idx, { rarity: e.target.value })}
                  className="col-span-2 rounded-lg border border-border bg-card px-2 py-1.5"
                >
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={it.value}
                  onChange={(e) => update(idx, { value: Number(e.target.value) || 0 })}
                  placeholder="value"
                  className="col-span-2 rounded-lg border border-border bg-card px-2 py-1.5"
                />
                <input
                  type="number"
                  step="0.01"
                  value={it.weight}
                  onChange={(e) => update(idx, { weight: Number(e.target.value) || 0 })}
                  placeholder="weight"
                  className="col-span-2 rounded-lg border border-border bg-card px-2 py-1.5"
                />
                <span className="col-span-1 text-center text-xs text-muted-foreground">
                  {dropPct}%
                </span>
                <button
                  onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}
                  className="col-span-1 flex justify-center text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm">
          <div>
            Avg item value:{" "}
            <span className="font-black text-primary">{Math.round(ev).toLocaleString()}</span>
          </div>
          <div className="text-muted-foreground">
            Players net ~{((ev / Math.max(1, price)) * 95).toFixed(0)}% per open after house edge
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-primary px-5 py-2 font-black text-primary-foreground disabled:bg-muted"
          >
            {busy ? "Submitting..." : "Submit for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}