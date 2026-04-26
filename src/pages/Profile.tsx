import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import { MizrahiCoin } from "@/components/MizrahiCoin";
import { formatCoins } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AVATAR_OPTIONS } from "@/lib/avatars";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface Bet {
  id: string;
  game: string;
  bet_amount: number;
  payout: number;
  multiplier: number;
  won: boolean;
  created_at: string;
}

export default function Profile() {
  const { user } = useAuth();
  const { profile, refetch, setLocalCoins } = useUserProfile();
  const [name, setName] = useState("");
  const [bets, setBets] = useState<Bet[]>([]);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [grantTo, setGrantTo] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [granting, setGranting] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.email?.toLowerCase() === "ps4spotifynitay@gmail.com";

  useEffect(() => {
    if (profile?.username) setName(profile.username);
  }, [profile?.username]);

  async function pickAvatar(value: string) {
    if (!user || value === profile?.avatar) return;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar: value })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Avatar updated");
    refetch();
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5 MB");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // Stable per-user filename (with cache-bust via ?t=) so the public
      // URL is the same across uploads and old images get overwritten.
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await pickAvatar(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("bets")
        .select("id, game, bet_amount, payout, multiplier, won, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setBets(
        (data ?? []).map((b) => ({
          id: b.id,
          game: b.game,
          bet_amount: Number(b.bet_amount),
          payout: Number(b.payout),
          multiplier: Number(b.multiplier),
          won: b.won,
          created_at: b.created_at,
        })),
      );
    })();
  }, [user, profile?.coins]);

  async function saveName() {
    if (!user) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) return toast.error("Name too short");
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Username updated");
    refetch();
  }

  async function redeem() {
    const c = code.trim();
    if (!c) return toast.error("Enter a code");
    setRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_code", { _code: c });
    setRedeeming(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      setLocalCoins(Number(r.new_balance));
      toast.success(`+${formatCoins(Number(r.awarded))} coins!`);
    }
    setCode("");
  }

  async function grantCoins() {
    const u = grantTo.trim();
    const amt = Math.floor(Number(grantAmount));
    if (!u) return toast.error("Enter a username");
    if (!Number.isFinite(amt) || amt === 0) return toast.error("Enter a valid amount");
    setGranting(true);
    const { data, error } = await supabase.rpc("admin_grant_coins", {
      _recipient_username: u,
      _amount: amt,
    });
    setGranting(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      toast.success(
        `${amt > 0 ? "+" : ""}${formatCoins(Number(r.amount))} → ${r.recipient_username} (now ${formatCoins(Number(r.recipient_balance))})`,
      );
      // If we granted to ourselves, refresh local balance
      if (u.toLowerCase() === (profile?.username ?? "").toLowerCase()) {
        setLocalCoins(Number(r.recipient_balance));
      }
      setGrantTo("");
      setGrantAmount("");
    }
  }

  async function sendCoins() {
    const u = sendTo.trim();
    const amt = Math.floor(Number(sendAmount));
    if (!u) return toast.error("Enter a username");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be positive");
    if (profile && amt > profile.coins) return toast.error("Not enough coins");
    setSending(true);
    const { data, error } = await supabase.rpc("transfer_coins", {
      _recipient_username: u,
      _amount: amt,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    const r = data?.[0];
    if (r) {
      setLocalCoins(Number(r.new_balance));
      toast.success(
        `Sent ${formatCoins(Number(r.amount))} → ${r.recipient_username}`,
      );
      setSendTo("");
      setSendAmount("");
    }
  }

  const profit = (profile?.total_won ?? 0) - (profile?.total_wagered ?? 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/40 bg-card shadow-[0_0_22px_hsl(var(--primary)/0.25)]">
            <PlayerAvatar avatar={profile?.avatar} size={56} className="rounded-2xl" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">PROFILE</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Avatar · seen by other players in poker, blackjack & multiplayer games
        </label>

        {/* Upload your own picture */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-background/40 p-3">
          <PlayerAvatar avatar={profile?.avatar} size={56} ring />
          <div className="flex-1 min-w-[160px]">
            <div className="text-sm font-bold">Upload your own picture</div>
            <div className="text-xs text-muted-foreground">JPG / PNG / WEBP · max 5 MB · square works best</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload image"}
          </Button>
        </div>

        <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          …or pick an emoji
        </div>
        <div className="mt-2 grid grid-cols-8 gap-2 sm:grid-cols-12">
          {AVATAR_OPTIONS.map((emoji) => {
            const active = profile?.avatar === emoji;
            return (
              <button
                key={emoji}
                onClick={() => pickAvatar(emoji)}
                className={`flex aspect-square items-center justify-center rounded-xl border-2 text-2xl transition ${
                  active
                    ? "border-primary bg-primary/15 shadow-[0_0_16px_hsl(var(--primary)/0.45)] scale-105"
                    : "border-border bg-background/40 hover:bg-card"
                }`}
                aria-label={`Use ${emoji} as avatar`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Username</label>
        <div className="mt-2 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          <Button onClick={saveName}>Save</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-primary">
              🎁 Redeem code
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Got a code? Drop it in for free Mizrahi Coins.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ENTER CODE"
            disabled={redeeming}
            className="uppercase tracking-widest"
            onKeyDown={(e) => {
              if (e.key === "Enter") redeem();
            }}
          />
          <Button onClick={redeem} disabled={redeeming || !code.trim()}>
            {redeeming ? "..." : "Redeem"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-[hsl(var(--success))]/30 bg-gradient-to-br from-[hsl(var(--success))]/10 to-transparent p-5">
        <h2 className="text-sm font-black uppercase tracking-widest text-[hsl(var(--success))]">
          💸 Send coins to a player
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Transfer Mizrahi Coins to anyone by their username. No takebacks.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
          <Input
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            placeholder="Recipient username"
            disabled={sending}
          />
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            placeholder="Amount"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendCoins();
            }}
          />
          <Button
            onClick={sendCoins}
            disabled={sending || !sendTo.trim() || !sendAmount}
            className="bg-[hsl(var(--success))] text-background hover:bg-[hsl(var(--success))]/90"
          >
            {sending ? "..." : "Send"}
          </Button>
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-3xl border border-destructive/40 bg-gradient-to-br from-destructive/10 to-transparent p-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-destructive">
            👑 Admin · Grant coins
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add (or subtract with a negative amount) coins to any player by username.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              value={grantTo}
              onChange={(e) => setGrantTo(e.target.value)}
              placeholder="Username"
              disabled={granting}
            />
            <Input
              type="number"
              inputMode="numeric"
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
              placeholder="Amount"
              disabled={granting}
              onKeyDown={(e) => {
                if (e.key === "Enter") grantCoins();
              }}
            />
            <Button
              onClick={grantCoins}
              disabled={granting || !grantTo.trim() || !grantAmount}
              variant="destructive"
            >
              {granting ? "..." : "Grant"}
            </Button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Balance" value={formatCoins(profile?.coins ?? 0)} coin />
        <Stat label="Wagered" value={formatCoins(profile?.total_wagered ?? 0)} coin />
        <Stat
          label="Profit"
          value={`${profit >= 0 ? "+" : ""}${formatCoins(profit)}`}
          coin
          tone={profit >= 0 ? "good" : "bad"}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">Recent bets</h2>
        {bets.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            No bets yet. Hit the lobby and start spinning.
          </div>
        ) : (
          <ul className="space-y-2">
            {bets.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-3"
              >
                <div>
                  <div className="text-sm font-bold capitalize">{b.game}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCoins(b.bet_amount)} @ {Number(b.multiplier).toFixed(2)}×
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1 font-black tabular-nums ${
                    b.won ? "text-[hsl(var(--success))]" : "text-destructive"
                  }`}
                >
                  <MizrahiCoin size={14} />
                  {b.won ? `+${formatCoins(b.payout - b.bet_amount)}` : `-${formatCoins(b.bet_amount)}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  coin,
  tone,
}: {
  label: string;
  value: string;
  coin?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 flex items-center justify-center gap-1 text-base font-black tabular-nums ${
          tone === "good" ? "text-[hsl(var(--success))]" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {coin && <MizrahiCoin size={14} />}
        {value}
      </div>
    </div>
  );
}