import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTrackGame } from "@/hooks/usePresence";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { Delete, RotateCcw, Sparkles } from "lucide-react";

// Compact 5-letter answer pool (common, fair). Guesses accept any A-Z 5-letter combo.
const WORDS = [
  "apple","beach","candy","dance","eagle","flame","grape","heart","ivory","joker",
  "knife","lemon","music","night","ocean","piano","queen","river","stone","tiger",
  "unity","vivid","water","xenon","youth","zebra","brave","cloud","drink","earth",
  "frost","ghost","house","input","jelly","karma","light","money","novel","onion",
  "plant","quilt","raven","sword","table","umbra","vapor","wheat","glove","amber",
  "blush","crisp","dwarf","ember","feast","glide","haste","irate","jolly","knack",
  "lunar","mirth","nudge","ovate","pluck","quart","rusty","shine","trust","upset",
  "vague","witty","yacht","zesty","alert","bloom","creek","dough","extra","fancy",
  "gleam","hover","ideal","joint","kneel","level","magic","north","olive","prize",
  "quick","robot","spice","theme","under","viper","weave","yield","abide","biome",
  "chess","drone","epoch","flair","glyph","hatch","input","jumbo","kiosk","ledge",
  "moose","nymph","optic","pearl","quirk","relax","study","towel","ultra","vault",
  "whirl","fjord","glade","hippo","jewel","mango","peach","plumb","scout","spark",
];

type LetterStatus = "correct" | "present" | "absent" | "empty" | "tbd";
type Tile = { ch: string; status: LetterStatus };
const MAX_ROWS = 6;
const COLS = 5;

function pickWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function evaluate(guess: string, answer: string): LetterStatus[] {
  const result: LetterStatus[] = Array(COLS).fill("absent");
  const ans = answer.split("");
  // first pass — correct
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === ans[i]) {
      result[i] = "correct";
      ans[i] = "·";
    }
  }
  // second pass — present
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    const idx = ans.indexOf(guess[i]);
    if (idx !== -1) {
      result[i] = "present";
      ans[idx] = "·";
    }
  }
  return result;
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export default function Wordle() {
  useTrackGame("wordle");
  const { profile, setLocalCoins, refetch } = useUserProfile();
  const [answer, setAnswer] = useState<string>(() => pickWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [done, setDone] = useState<"win" | "lose" | null>(null);
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);

  const grid: Tile[][] = useMemo(() => {
    const out: Tile[][] = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      const row: Tile[] = [];
      const g = guesses[r];
      if (g) {
        const ev = evaluate(g, answer);
        for (let c = 0; c < COLS; c++) row.push({ ch: g[c].toUpperCase(), status: ev[c] });
      } else if (r === guesses.length) {
        for (let c = 0; c < COLS; c++)
          row.push({ ch: (current[c] ?? "").toUpperCase(), status: current[c] ? "tbd" : "empty" });
      } else {
        for (let c = 0; c < COLS; c++) row.push({ ch: "", status: "empty" });
      }
      out.push(row);
    }
    return out;
  }, [guesses, current, answer]);

  const keyStatus = useMemo(() => {
    const map: Record<string, LetterStatus> = {};
    for (const g of guesses) {
      const ev = evaluate(g, answer);
      for (let i = 0; i < COLS; i++) {
        const ch = g[i];
        const cur = map[ch];
        const nx = ev[i];
        const rank = (s?: LetterStatus) =>
          s === "correct" ? 3 : s === "present" ? 2 : s === "absent" ? 1 : 0;
        if (rank(nx) > rank(cur)) map[ch] = nx;
      }
    }
    return map;
  }, [guesses, answer]);

  const reset = useCallback(() => {
    setAnswer(pickWord());
    setGuesses([]);
    setCurrent("");
    setDone(null);
  }, []);

  const submit = useCallback(async () => {
    if (done || busy) return;
    if (current.length !== COLS) {
      toast.error("Word must be 5 letters");
      return;
    }
    const guess = current.toLowerCase();
    const nextGuesses = [...guesses, guess];
    setGuesses(nextGuesses);
    setCurrent("");

    if (guess === answer) {
      setDone("win");
      setStreak((s) => s + 1);
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc("wordle_win", {
          _word: answer,
          _attempts: nextGuesses.length,
        });
        if (error) {
          console.error("[wordle_win] rpc error", error);
          toast.error(`Couldn't credit win: ${error.message}`);
          await refetch();
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          const awarded = Number(row?.awarded ?? 500);
          const bal = Number(row?.new_balance);
          if (Number.isFinite(bal)) setLocalCoins(bal);
          else await refetch();
          toast.success(
            `+${formatCoins(awarded)} coins! Solved in ${nextGuesses.length}/${MAX_ROWS}`,
          );
        }
      } catch (e) {
        console.error("[wordle_win] threw", e);
        toast.error(e instanceof Error ? e.message : "Couldn't credit win");
        await refetch();
      } finally {
        setBusy(false);
      }
    } else if (nextGuesses.length >= MAX_ROWS) {
      setDone("lose");
      setStreak(0);
      toast.error(`Out of guesses — the word was ${answer.toUpperCase()}`);
    }
  }, [answer, busy, current, done, guesses, refetch, setLocalCoins]);

  const press = useCallback(
    (key: string) => {
      if (done) return;
      if (key === "ENTER") return submit();
      if (key === "BACK") return setCurrent((c) => c.slice(0, -1));
      if (/^[a-z]$/.test(key) && current.length < COLS) {
        setCurrent((c) => (c + key).slice(0, COLS));
      }
    },
    [current.length, done, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        press("ENTER");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        press("BACK");
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        press(e.key.toLowerCase());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">WORDLE</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Guess the 5-letter word · win <span className="font-bold text-[hsl(var(--success))]">+500 coins</span> per solve · infinite plays
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span className="rounded-md bg-secondary px-2 py-1">Streak <span className="text-foreground tabular-nums">{streak}</span></span>
          <span className="rounded-md bg-secondary px-2 py-1">Guess <span className="text-foreground tabular-nums">{Math.min(guesses.length + (done ? 0 : 1), MAX_ROWS)}/{MAX_ROWS}</span></span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] sm:gap-4">
        {/* Game board */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl sm:rounded-3xl sm:p-6">
          <div className="grid grid-rows-6 gap-1.5 sm:gap-2">
            {grid.map((row, r) => (
              <div key={r} className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {row.map((tile, c) => (
                  <motion.div
                    key={c}
                    initial={false}
                    animate={{
                      rotateX: tile.status === "correct" || tile.status === "present" || tile.status === "absent" ? [0, 90, 0] : 0,
                      scale: tile.status === "tbd" ? [1, 1.08, 1] : 1,
                    }}
                    transition={{ duration: 0.45, delay: c * 0.08 }}
                    className={`flex h-12 w-12 items-center justify-center rounded-md border-2 text-xl font-black uppercase sm:h-14 sm:w-14 sm:text-2xl ${tileClass(tile.status)}`}
                  >
                    {tile.ch}
                  </motion.div>
                ))}
              </div>
            ))}
          </div>

          {done && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className={`flex items-center gap-2 text-sm font-black uppercase tracking-widest ${done === "win" ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                {done === "win" ? <><Sparkles className="h-4 w-4" /> Solved!</> : <>Word was {answer.toUpperCase()}</>}
              </div>
              <Button onClick={reset} className="font-black">
                <RotateCcw className="mr-2 h-4 w-4" /> NEW WORD
              </Button>
            </div>
          )}
        </div>

        {/* Side panel — keyboard + controls */}
        <div className="rounded-2xl border border-border bg-card/70 p-3 backdrop-blur-xl sm:rounded-3xl sm:p-4 md:sticky md:top-4 md:self-start">
          <div className="mb-3 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-xl bg-background/60 p-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reward</div>
              <div className="text-base font-black text-[hsl(var(--success))]">+500</div>
            </div>
            <div className="rounded-xl bg-background/60 p-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Balance</div>
              <div className="text-base font-black tabular-nums">{formatCoins(profile?.coins ?? 0)}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            {ROWS.map((row, ri) => (
              <div key={ri} className="flex justify-center gap-1">
                {ri === 2 && (
                  <KeyButton wide onClick={() => press("ENTER")}>ENTER</KeyButton>
                )}
                {row.split("").map((k) => (
                  <KeyButton key={k} status={keyStatus[k]} onClick={() => press(k)}>
                    {k.toUpperCase()}
                  </KeyButton>
                ))}
                {ri === 2 && (
                  <KeyButton wide onClick={() => press("BACK")}>
                    <Delete className="h-4 w-4" />
                  </KeyButton>
                )}
              </div>
            ))}
          </div>

          <Button onClick={reset} variant="secondary" className="mt-3 w-full font-bold">
            <RotateCcw className="mr-2 h-4 w-4" /> Skip / New word
          </Button>
        </div>
      </div>
    </div>
  );
}

function tileClass(s: LetterStatus) {
  switch (s) {
    case "correct":
      return "border-[hsl(var(--success))] bg-[hsl(var(--success))] text-background";
    case "present":
      return "border-amber-500 bg-amber-500 text-background";
    case "absent":
      return "border-border bg-muted text-muted-foreground";
    case "tbd":
      return "border-foreground/40 bg-background text-foreground";
    default:
      return "border-border bg-background text-foreground";
  }
}

function KeyButton({
  children,
  onClick,
  status,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  status?: LetterStatus;
  wide?: boolean;
}) {
  const cls =
    status === "correct"
      ? "bg-[hsl(var(--success))] text-background"
      : status === "present"
        ? "bg-amber-500 text-background"
        : status === "absent"
          ? "bg-muted text-muted-foreground"
          : "bg-secondary text-foreground hover:bg-accent";
  return (
    <button
      onClick={onClick}
      className={`flex h-10 items-center justify-center rounded-md text-xs font-black uppercase transition active:scale-95 ${
        wide ? "px-3" : "w-7 sm:w-8"
      } ${cls}`}
    >
      {children}
    </button>
  );
}