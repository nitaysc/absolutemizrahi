import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";

/**
 * Quick-chat emotes for multiplayer games.
 *
 * Two pieces:
 *   - <EmotePanel channelKey="..." />   floating button + popover (sender)
 *   - <EmoteBubble channelKey="..." userId="..." />  per-player bubble (renders
 *     next to a player's name when *that* player emotes)
 *
 * Both share a global per-channel event bus so any number of bubbles can
 * subscribe without each opening their own realtime channel. The panel owns
 * the single Supabase channel.
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
  id: string;
  user_id: string;
  username: string;
  preset: string;
  label: string;
  emoji: string;
  ts: number;
};

// ─── Per-channel event bus ────────────────────────────────────────────────
type Listener = (payload: EmotePayload) => void;
const buses = new Map<string, Set<Listener>>();

function getBus(channelKey: string): Set<Listener> {
  let b = buses.get(channelKey);
  if (!b) {
    b = new Set();
    buses.set(channelKey, b);
  }
  return b;
}

function emit(channelKey: string, payload: EmotePayload) {
  const b = buses.get(channelKey);
  if (!b) return;
  b.forEach((l) => l(payload));
}

function subscribe(channelKey: string, listener: Listener) {
  const b = getBus(channelKey);
  b.add(listener);
  return () => {
    b.delete(listener);
  };
}

// ─── Sender: floating button + popover ───────────────────────────────────
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
  const [cooldown, setCooldown] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Single Supabase channel per mount. Re-broadcasts onto the local bus so
  // any <EmoteBubble> listeners can render bubbles by user_id.
  useEffect(() => {
    const ch = supabase.channel(`emotes:${channelKey}`, {
      config: { broadcast: { self: true } },
    });
    ch.on("broadcast", { event: "emote" }, ({ payload }) => {
      emit(channelKey, payload as EmotePayload);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelKey]);

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
      preset: preset.id,
      label: preset.label,
      emoji: preset.emoji,
      ts: Date.now(),
    };
    channelRef.current.send({ type: "broadcast", event: "emote", payload });
    setOpen(false);
    setCooldown(2);
  };

  return (
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
              <motion.button
                key={p.id}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => send(p)}
                disabled={cooldown > 0}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-transparent bg-card/60 px-1.5 py-2 text-[11px] font-bold transition hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="text-lg leading-none">{p.emoji}</span>
                <span className="truncate">{p.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.08 }}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-background/90 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.35)] backdrop-blur-md",
          open && "bg-primary/20",
        )}
        aria-label="Open emotes"
      >
        {cooldown > 0 ? (
          <span className="text-xs font-bold tabular-nums">{cooldown}s</span>
        ) : (
          <Smile className="h-5 w-5" />
        )}
      </motion.button>
    </div>
  );
}

// ─── Per-player bubble (renders next to a username) ──────────────────────
export function EmoteBubble({
  channelKey,
  userId,
  side = "top",
  className,
}: {
  channelKey: string;
  userId: string | null | undefined;
  /** Where the bubble appears relative to its parent. */
  side?: "top" | "right" | "left" | "bottom";
  className?: string;
}) {
  const [active, setActive] = useState<EmotePayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    return subscribe(channelKey, (p) => {
      if (p.user_id !== userId) return;
      setActive({ ...p });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(null), 2600);
    });
  }, [channelKey, userId]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const positionCls =
    side === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-1.5"
      : side === "bottom"
        ? "top-full left-1/2 -translate-x-1/2 mt-1.5"
        : side === "left"
          ? "right-full top-1/2 -translate-y-1/2 mr-1.5"
          : "left-full top-1/2 -translate-y-1/2 ml-1.5";

  return (
    <span className={cn("pointer-events-none absolute z-40", positionCls, className)}>
      <AnimatePresence>
        {active && (
          <motion.span
            key={active.id}
            initial={{ opacity: 0, scale: 0.5, y: side === "top" ? 8 : -8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { type: "spring", stiffness: 520, damping: 18 },
            }}
            exit={{ opacity: 0, scale: 0.7, y: side === "top" ? -10 : 10, transition: { duration: 0.2 } }}
            className="flex items-center gap-1 whitespace-nowrap rounded-full border border-primary/50 bg-background/95 px-2.5 py-1 text-xs font-black shadow-[0_0_18px_hsl(var(--primary)/0.45)] backdrop-blur-md"
          >
            <motion.span
              animate={{ rotate: [0, -12, 12, -8, 0], scale: [1, 1.25, 1.1, 1] }}
              transition={{ duration: 0.6 }}
              className="text-sm leading-none"
            >
              {active.emoji}
            </motion.span>
            <span className="text-gradient">{active.label}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// Suppress unused import warning when no bubble subscribers exist.
void useSyncExternalStore;