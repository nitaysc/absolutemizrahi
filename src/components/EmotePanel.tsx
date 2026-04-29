import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";

/**
 * Quick-chat emotes for multiplayer games.
 *
 * Renders a small floating button (bottom-right of its positioned parent).
 * Tap to open a popover of preset emotes; selecting one broadcasts via a
 * dedicated Supabase realtime channel and animates a bubble for ~2.5s
 * over the sender's avatar.
 *
 * Usage: place inside a `relative` container and pass a stable `channelKey`
 * unique to the game/room (e.g. `emotes:poker:<tableId>`).
 */

const PRESETS = [
  { id: "gg", label: "GG", emoji: "🤝" },
  { id: "noway", label: "NO WAY", emoji: "😭" },
  { id: "rigged", label: "RIGGED", emoji: "🤬" },
  { id: "nice", label: "NICE!", emoji: "🔥" },
  { id: "lol", label: "LOL", emoji: "😂" },
  { id: "clutch", label: "CLUTCH", emoji: "🎯" },
  { id: "ez", label: "EZ", emoji: "😎" },
  { id: "rip", label: "RIP", emoji: "💀" },
  { id: "luck", label: "GL", emoji: "🍀" },
] as const;

type EmotePayload = {
  id: string; // unique event id
  user_id: string;
  username: string;
  avatar: string;
  preset: string;
  label: string;
  emoji: string;
  ts: number;
};

type Bubble = EmotePayload & { _key: string };

export function EmotePanel({
  channelKey,
  className,
}: {
  channelKey: string;
  className?: string;
}) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to the dedicated emote broadcast channel
  useEffect(() => {
    const ch = supabase.channel(`emotes:${channelKey}`, {
      config: { broadcast: { self: true } },
    });
    ch.on("broadcast", { event: "emote" }, ({ payload }) => {
      const p = payload as EmotePayload;
      const bubble: Bubble = { ...p, _key: `${p.id}-${p.ts}` };
      setBubbles((prev) => [...prev.slice(-7), bubble]);
      // Auto-remove after 2.6s
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b._key !== bubble._key));
      }, 2600);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelKey]);

  // Tick down cooldown each second
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = (preset: (typeof PRESETS)[number]) => {
    if (!user || !profile || cooldown > 0 || !channelRef.current) return;
    const payload: EmotePayload = {
      id: `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user.id,
      username: profile.username ?? "player",
      avatar: profile.avatar ?? "🎰",
      preset: preset.id,
      label: preset.label,
      emoji: preset.emoji,
      ts: Date.now(),
    };
    channelRef.current.send({ type: "broadcast", event: "emote", payload });
    setOpen(false);
    setCooldown(2); // 2s anti-spam
  };

  return (
    <>
      {/* Floating bubbles overlay (top-center of parent) */}
      <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex flex-col items-center gap-1.5">
        <AnimatePresence>
          {bubbles.map((b) => (
            <motion.div
              key={b._key}
              initial={{ opacity: 0, y: -8, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="flex max-w-[90%] items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3 py-1.5 text-sm font-bold shadow-[0_0_18px_hsl(var(--primary)/0.35)] backdrop-blur-md"
            >
              <span className="text-base leading-none">{b.avatar}</span>
              <span className="truncate max-w-[100px] text-xs text-muted-foreground">
                {b.username}
              </span>
              <span className="text-base leading-none">{b.emoji}</span>
              <span className="text-gradient">{b.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Trigger button + popover */}
      <div className={cn("absolute bottom-3 right-3 z-40", className)}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-12 right-0 grid w-56 grid-cols-3 gap-1.5 rounded-2xl border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-xl"
            >
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => send(p)}
                  disabled={cooldown > 0}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-transparent bg-card/60 px-1.5 py-2 text-[11px] font-bold transition hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="text-lg leading-none">{p.emoji}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-background/90 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.35)] backdrop-blur-md transition hover:scale-105 active:scale-95",
            open && "bg-primary/20",
          )}
          aria-label="Open emotes"
        >
          {cooldown > 0 ? (
            <span className="text-xs font-bold tabular-nums">{cooldown}s</span>
          ) : (
            <Smile className="h-5 w-5" />
          )}
        </button>
      </div>
    </>
  );
}
