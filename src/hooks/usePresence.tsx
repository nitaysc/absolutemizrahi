import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Realtime presence: each tab joins a channel and sets `{ game }` on its
 * presence state. The lobby reads that to count truly online players per game.
 *
 * - When a tab closes / loses connection, Supabase auto-removes its presence,
 *   so counts drop within a few seconds (no fake "still playing").
 */
type Counts = Record<string, number>;
type Ctx = {
  counts: Counts;
  total: number;
  /** Per-user-id → current game (or null = lobby). Empty if user is offline. */
  byUser: Record<string, string | null>;
  /** Tell the presence channel which game this tab is currently on (or `null` for lobby). */
  setGame: (game: string | null) => void;
};

const PresenceContext = createContext<Ctx | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts>({});
  const [total, setTotal] = useState(0);
  const [byUser, setByUser] = useState<Record<string, string | null>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentGame = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("presence-lobby", {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ game?: string | null }>>;
        const next: Counts = {};
        const map: Record<string, string | null> = {};
        let totalUsers = 0;
        for (const userId of Object.keys(state)) {
          totalUsers += 1;
          const metas = state[userId] ?? [];
          const detailed = metas.find((meta) => typeof meta.game === "string" && meta.game.includes(":"));
          const active = detailed ?? metas.find((meta) => meta.game);
          const g = active?.game ?? null;
          map[userId] = g;
          if (g) next[g] = (next[g] ?? 0) + 1;
        }
        setCounts(next);
        setTotal(totalUsers);
        setByUser(map);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ game: currentGame.current, online_at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]);

  const setGame = (game: string | null) => {
    currentGame.current = game;
    channelRef.current?.track({ game, online_at: Date.now() });
  };

  return (
    <PresenceContext.Provider value={{ counts, total, byUser, setGame }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used inside <PresenceProvider>");
  return ctx;
}

/** Mount this on a game page so the user is counted under that game. */
export function useTrackGame(game: string | null) {
  const { setGame } = usePresence();
  useEffect(() => {
    setGame(game);
    return () => setGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
}
