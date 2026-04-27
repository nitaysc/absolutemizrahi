import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ImagePlus, Loader2 } from "lucide-react";

type Item = {
  name: string;
  image: string;
  value: number;
  weight: number;
  rarity: string;
};

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Upload a file to the public case-assets bucket, scoped under the user's id. */
async function uploadToBucket(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("case-assets")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    toast.error(error.message);
    return null;
  }
  const { data } = supabase.storage.from("case-assets").getPublicUrl(path);
  return data.publicUrl;
}

function isUrl(s: string | null | undefined) {
  return !!s && /^https?:\/\//i.test(s);
}

export default function CaseUpload() {
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [image, setImage] = useState("🎁");
  const [coverImage, setCoverImage] = useState<string>("");
  const [price, setPrice] = useState(500);
  const [items, setItems] = useState<Item[]>([
    { name: "", image: "🎁", value: 100, weight: 50, rarity: "common" },
  ]);
  const [busy, setBusy] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const ev =
    totalWeight > 0
      ? items.reduce((s, i) => s + (Number(i.value) || 0) * (Number(i.weight) || 0), 0) /
        totalWeight
      : 0;

  function update(idx: number, patch: Partial<Item>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleUpload(
    file: File | undefined,
    key: string,
    onUrl: (url: string) => void,
  ) {
    if (!file || !profile) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Max 4MB image");
    if (!file.type.startsWith("image/")) return toast.error("Image files only");
    setUploadingKey(key);
    const url = await uploadToBucket(profile.id, file);
    setUploadingKey(null);
    if (url) onUrl(url);
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
        cover_image: coverImage || null,
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
          Submit a case for admin approval. Item weights determine drop %. You can use
          either emoji or upload custom images for your case icon, cover banner, and items.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Case name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
              placeholder="My Awesome Case"
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {/* Case icon: emoji OR uploaded image */}
          <Field label="Case icon (emoji or image)">
            <div className="flex items-center gap-2">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-3xl">
                {isUrl(image) ? (
                  <img src={image} alt="icon" className="h-full w-full object-cover" />
                ) : (
                  image || "🎁"
                )}
              </div>
              <input
                value={isUrl(image) ? "" : image}
                onChange={(e) => setImage(e.target.value.slice(0, 4) || "🎁")}
                placeholder="🎁"
                className="w-20 rounded-xl border border-border bg-background px-2 py-2 text-center text-2xl"
              />
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) =>
                  handleUpload(e.target.files?.[0], "icon", (url) => setImage(url))
                }
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={uploadingKey === "icon"}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:border-primary"
              >
                {uploadingKey === "icon" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Upload
              </button>
              {isUrl(image) && (
                <button
                  type="button"
                  onClick={() => setImage("🎁")}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>

          {/* Cover banner */}
          <Field label="Cover banner image (optional)">
            <div className="flex items-center gap-2">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-xs text-muted-foreground">
                {coverImage ? (
                  <img src={coverImage} alt="cover" className="h-full w-full object-cover" />
                ) : (
                  "no cover"
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) =>
                  handleUpload(e.target.files?.[0], "cover", (url) => setCoverImage(url))
                }
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingKey === "cover"}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:border-primary"
              >
                {uploadingKey === "cover" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Upload cover
              </button>
              {coverImage && (
                <button
                  type="button"
                  onClick={() => setCoverImage("")}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear
                </button>
              )}
            </div>
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
            const itemKey = `item-${idx}`;
            return (
              <div
                key={idx}
                className="grid grid-cols-12 items-center gap-2 rounded-xl border border-border bg-background p-2"
              >
                {/* Item image: emoji or upload */}
                <div className="col-span-2 flex items-center gap-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card text-lg">
                    {isUrl(it.image) ? (
                      <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      it.image || "🎁"
                    )}
                  </div>
                  {!isUrl(it.image) && (
                    <input
                      value={it.image}
                      onChange={(e) => update(idx, { image: e.target.value.slice(0, 4) || "🎁" })}
                      className="w-10 rounded-lg border border-border bg-card px-1 py-1.5 text-center text-sm"
                    />
                  )}
                  <label className="cursor-pointer rounded-lg border border-border bg-card px-1.5 py-1.5 text-xs hover:border-primary">
                    {uploadingKey === itemKey ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3 w-3" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) =>
                        handleUpload(e.target.files?.[0], itemKey, (url) =>
                          update(idx, { image: url }),
                        )
                      }
                    />
                  </label>
                  {isUrl(it.image) && (
                    <button
                      type="button"
                      onClick={() => update(idx, { image: "🎁" })}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      title="Clear image"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  value={it.name}
                  onChange={(e) => update(idx, { name: e.target.value.slice(0, 50) })}
                  placeholder="Item name"
                  className="col-span-3 rounded-lg border border-border bg-card px-2 py-1.5"
                />
                <select
                  value={it.rarity}
                  onChange={(e) => update(idx, { rarity: e.target.value })}
                  className="col-span-2 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
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
                  className="col-span-1 rounded-lg border border-border bg-card px-2 py-1.5"
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
            RTP ~{((ev / Math.max(1, price)) * 100).toFixed(0)}% per open
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