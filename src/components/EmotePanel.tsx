import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Smile, Send } from "lucide-react";
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
  kind: "preset" | "text";
  preset?: string;
  label: string;
  emoji?: string;
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
  b?.forEach((l) => l(payload));
  window.dispatchEvent(new CustomEvent(`emote:${channelKey}`, { detail: payload }));
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
  const [text, setText] = useState("");
  const [feed, setFeed] = useState<EmotePayload[]>([]);
  const feedTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const subscribedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingRef = useRef<EmotePayload[]>([]);

  const username =
    profile?.username ||
    (user?.user_metadata?.username as string | undefined) ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "player";

  // Single Supabase broadcast channel per mount. Re-broadcasts onto the local
  // bus so any <EmoteBubble> listeners can render bubbles by user_id.
  useEffect(() => {
    subscribedRef.current = false;
    const ch = supabase.channel(`emotes:${channelKey}`, {
      config: { broadcast: { self: true, ack: true } },
    });
    ch.on("broadcast", { event: "emote" }, ({ payload }) => {
      emit(channelKey, payload as EmotePayload);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribedRef.current = true;
        const queued = pendingRef.current.splice(0);
        queued.forEach((payload) => {
          ch.send({ type: "broadcast", event: "emote", payload }).catch(() => {});
        });
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        subscribedRef.current = false;
      }
    });
    channelRef.current = ch;
    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const showInFeed = (payload: EmotePayload) => {
      setFeed((items) => {
        const withoutDuplicate = items.filter((item) => item.id !== payload.id);
        return [payload, ...withoutDuplicate].slice(0, 3);
      });
      if (feedTimersRef.current.has(payload.id)) clearTimeout(feedTimersRef.current.get(payload.id));
      feedTimersRef.current.set(
        payload.id,
        setTimeout(() => {
          setFeed((items) => items.filter((item) => item.id !== payload.id));
          feedTimersRef.current.delete(payload.id);
        }, 3200),
      );
  };

  useEffect(() => {
    const unsubscribe = subscribe(channelKey, (payload) => {
      showInFeed(payload);
    });
    return () => {
      unsubscribe();
      feedTimersRef.current.forEach((timer) => clearTimeout(timer));
      feedTimersRef.current.clear();
    };
  }, [channelKey]);

  const broadcast = (payload: EmotePayload) => {
    // Always show locally (instant feedback regardless of realtime echo)
    showInFeed(payload);
    emit(channelKey, payload);
    // Then send to others
    if (channelRef.current && subscribedRef.current) {
      channelRef.current
        .send({ type: "broadcast", event: "emote", payload })
        .catch(() => {});
    } else {
      pendingRef.current.push(payload);
    }
  };

  const sendPreset = (preset: (typeof PRESETS)[number]) => {
    if (cooldown > 0) return;
    broadcast({
      id: `${user?.id ?? "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user?.id ?? "local",
      username,
      kind: "preset",
      preset: preset.id,
      label: preset.label,
      emoji: preset.emoji,
      ts: Date.now(),
    });
    setOpen(false);
    setCooldown(2);
  };

  const sendText = () => {
    if (cooldown > 0) return;
    const trimmed = text.trim().slice(0, 80);
    if (!trimmed) return;
    broadcast({
      id: `${user?.id ?? "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user?.id ?? "local",
      username,
      kind: "text",
      label: trimmed,
      ts: Date.now(),
    });
    setText("");
    setOpen(false);
    setCooldown(2);
  };

  return createPortal(
    <div className={cn("fixed bottom-24 right-4 z-[9999] sm:bottom-6", className)}>
      <div className="pointer-events-none absolute bottom-14 right-0 flex w-64 flex-col items-end gap-1.5">
        <AnimatePresence initial={false}>
          {feed.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 24, scale: 0.86 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 18, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className="max-w-full rounded-2xl border border-primary/40 bg-background/95 px-3 py-2 text-xs font-black shadow-[0_0_24px_hsl(var(--primary)/0.35)] backdrop-blur-xl"
            >
              <div className="mb-0.5 max-w-[13rem] truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.username}
              </div>
              <div className="flex items-center gap-1.5 text-foreground">
                {item.kind === "preset" && item.emoji && <span className="text-base leading-none">{item.emoji}</span>}
                <span className={cn(item.kind === "preset" ? "text-gradient" : "break-words")}>{item.label}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-12 right-0 w-64 rounded-2xl border border-border bg-background/95 p-2 shadow-2xl backdrop-blur-xl"
          >
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <motion.button
                  type="button"
                  key={p.id}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    sendPreset(p);
                  }}
                  onClick={() => sendPreset(p)}
                  disabled={cooldown > 0}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-transparent bg-card/60 px-1.5 py-2 text-[11px] font-bold transition hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="text-lg leading-none">{p.emoji}</span>
                  <span className="truncate">{p.label}</span>
                </motion.button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 rounded-lg border border-border bg-card/60 px-1 focus-within:border-primary/60">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Say something…"
                maxLength={80}
                className="flex-1 bg-transparent px-2 py-2 text-xs font-medium outline-none placeholder:text-muted-foreground"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.08 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  sendText();
                }}
                onClick={sendText}
                disabled={cooldown > 0 || !text.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
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
    </div>,
    document.body,
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
    const show = (p: EmotePayload) => {
      setActive({ ...p });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(null), 2600);
    };
    const localHandler = (event: Event) => {
      const payload = (event as CustomEvent<EmotePayload>).detail;
      if (payload?.user_id === userId) show(payload);
    };
    window.addEventListener(`emote:${channelKey}`, localHandler);
    const unsubscribe = subscribe(channelKey, (p) => {
      if (p.user_id !== userId) return;
      show(p);
    });
    return () => {
      window.removeEventListener(`emote:${channelKey}`, localHandler);
      unsubscribe();
    };
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
            className={cn(
              "flex max-w-[220px] items-center gap-1 rounded-2xl border bg-background/95 px-2.5 py-1 text-xs font-black shadow-[0_0_18px_hsl(var(--primary)/0.45)] backdrop-blur-md",
              active.kind === "text"
                ? "border-primary/40 whitespace-normal text-left"
                : "border-primary/50 whitespace-nowrap",
            )}
          >
            {active.kind === "preset" && active.emoji && (
              <motion.span
                animate={{ rotate: [0, -12, 12, -8, 0], scale: [1, 1.25, 1.1, 1] }}
                transition={{ duration: 0.6 }}
                className="text-sm leading-none"
              >
                {active.emoji}
              </motion.span>
            )}
            <span
              className={cn(
                active.kind === "preset" ? "text-gradient" : "break-words text-foreground",
              )}
            >
              {active.label}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}